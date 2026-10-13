<?php
declare(strict_types=1);
namespace Tjl\CatalogueWorkspace\Controller;

use Symfony\Component\HttpFoundation\{Request,Response,JsonResponse,BinaryFileResponse};
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\Security\Core\Authorization\AuthorizationCheckerInterface;
use Symfony\Component\Security\Core\Authentication\Token\Storage\TokenStorageInterface;
use Symfony\Component\Security\Csrf\{CsrfToken,CsrfTokenManagerInterface};
use Tjl\CatalogueWorkspace\{Workspace,Store,ProjectArchive,Support};
use Twig\Environment;

final class AdminController
{
    public function __construct(
        private Workspace $workspace, private Store $store, private ProjectArchive $archive, private Environment $twig,
        private AuthorizationCheckerInterface $authorization, private TokenStorageInterface $tokens,
        private CsrfTokenManagerInterface $csrf, private string $operatorRole,
    ) {}

    private function actor(): string
    {
        $user = $this->tokens->getToken()?->getUser();
        if (!$this->authorization->isGranted($this->operatorRole) || !is_object($user) ||
            !method_exists($user, 'getId') || (method_exists($user, 'isEnabled') && !$user->isEnabled())) {
            throw new AccessDeniedHttpException('Use the existing enabled Sylius administrator session.');
        }
        return 'sylius-admin:' . (string) $user->getId() . ':' . $user->getUserIdentifier();
    }

    private function requireCsrf(Request $request): void
    {
        if (!$this->csrf->isTokenValid(new CsrfToken('catalogue-workspace', (string) $request->headers->get('X-CSRF-Token')))) {
            throw new AccessDeniedHttpException('The original administrator session token expired; reopen the workspace.');
        }
    }

    public function index(): Response
    {
        $actor = $this->actor();
        $response = new Response($this->twig->render('@TjlCatalogueWorkspace/workspace.html.twig',
            ['actor' => $actor, 'csrf' => $this->csrf->getToken('catalogue-workspace')->getValue()]));
        $response->headers->set('Cache-Control', 'private, no-store');
        $response->headers->set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'");
        $response->headers->set('Referrer-Policy', 'same-origin');
        return $response;
    }

    public function action(Request $request): JsonResponse
    {
        $actor = $this->actor(); $this->requireCsrf($request);
        $action = ''; $operation = ''; $project = null;
        try {
            if (strlen($request->getContent()) > 16777216) { throw new \InvalidArgumentException('Select an action input smaller than 16 MiB.'); }
            $body = json_decode($request->getContent(), true, 512, JSON_THROW_ON_ERROR);
            if (!is_array($body) || !is_array($body['input'] ?? null)) { throw new \InvalidArgumentException('Send the complete original action envelope.'); }
            $action = Support::requiredString($body, 'action', 64);
            $operation = Support::id(Support::requiredString($body, 'operation_id', 128));
            $project = $body['input']['project_id'] ?? null;
            // Initial schema installation is an explicit existing-host CLI action.
            if (in_array($action, ['install', 'receive'], true)) {
                throw new \InvalidArgumentException('Use the reviewed native host command or selected archive upload for this action.');
            }
            $result = $this->workspace->execute($action, $body['input'], $operation, $actor);
            return $this->json($result);
        } catch (\Throwable $error) {
            return $this->json(['schema' => 'tjl.catalogue.workspace-result.v1', 'state' => 'ATTENTION',
                'action' => $action, 'operation_id' => $operation, 'project_id' => $project, 'error' => Support::error($error)], 409);
        }
    }

    public function upload(Request $request): JsonResponse
    {
        $actor = $this->actor(); $this->requireCsrf($request);
        $project = (string) $request->request->get('project_id');
        $operation = (string) $request->request->get('operation_id');
        try {
            Support::id($project); Support::id($operation);
            $file = $request->files->get('archive');
            if (!$file instanceof \Symfony\Component\HttpFoundation\File\UploadedFile || !$file->isValid()) {
                throw new \InvalidArgumentException('Select the complete original catalogue ZIP.');
            }
            // Custody before the native transaction; the same SHA yields a stable input path on retry.
            $blob = $this->store->blobFile($file->getPathname());
            return $this->json($this->workspace->execute('receive',
                ['project_id' => $project, 'archive_path' => $this->store->blobPath($blob)], $operation, $actor));
        } catch (\Throwable $error) {
            return $this->json(['schema' => 'tjl.catalogue.workspace-result.v1', 'state' => 'ATTENTION',
                'action' => 'receive', 'operation_id' => $operation, 'project_id' => $project, 'error' => Support::error($error)], 409);
        }
    }

    public function download(string $project, string $sha): Response
    {
        $this->actor();
        $blob = $this->archive->selectedFile(Support::id($project), $sha);
        $response = new BinaryFileResponse($this->store->blobPath($blob));
        $response->setContentDisposition(ResponseHeaderBag::DISPOSITION_ATTACHMENT, $sha . '.bin');
        $response->headers->set('Content-Type', 'application/octet-stream');
        $response->headers->set('Cache-Control', 'private, no-store');
        $response->headers->set('X-Content-SHA256', $sha);
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        return $response;
    }

    public function asset(string $name): Response
    {
        $this->actor();
        $types = ['workspace.js' => 'text/javascript', 'workspace.css' => 'text/css'];
        if (!isset($types[$name])) { throw new \Symfony\Component\HttpKernel\Exception\NotFoundHttpException(); }
        $path = dirname(__DIR__, 2) . '/public/' . $name;
        $body = file_get_contents($path);
        if ($body === false) { throw new \RuntimeException('The complete installed application asset is missing.'); }
        return new Response($body, 200, ['Content-Type' => $types[$name] . '; charset=utf-8',
            'Cache-Control' => 'private, no-cache', 'X-Content-Type-Options' => 'nosniff']);
    }

    private function json(array $value, int $status = 200): JsonResponse
    {
        $response = new JsonResponse(Support::json($value), $status, [], true);
        $response->headers->set('Cache-Control', 'private, no-store');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        return $response;
    }
}
