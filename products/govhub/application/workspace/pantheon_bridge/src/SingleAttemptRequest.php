<?php

declare(strict_types=1);

namespace Commons\Terminus\GovHub;

use GuzzleHttp\Client;
use GuzzleHttp\Handler\StreamHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Promise\Create;
use GuzzleHttp\Psr7\Utils;
use Pantheon\Terminus\Request\Request;
use Pantheon\Terminus\Request\RequestOperationResult;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/**
 * Original Terminus authentication, path construction, request JSON and result
 * parsing, with one native transfer and a private byte-preserving observer.
 */
final class SingleAttemptRequest extends Request
{
    private ReceiptJournal $journal;
    private ?RequestOperationResult $lastResult = null;

    public function configure(ReceiptJournal $journal, int $timeoutSeconds): void
    {
        $this->journal = $journal;
        $config = $this->getConfig();
        $options = (array)$config->get('client_options');
        $options['http_errors'] = false;
        $options['allow_redirects'] = false;
        $options['decode_content'] = false;
        $options['headers'] = (array)($options['headers'] ?? []);
        $options['headers']['Accept-Encoding'] = 'identity';
        $options['timeout'] = $timeoutSeconds;
        $options['read_timeout'] = $timeoutSeconds;
        $options['connect_timeout'] = min($timeoutSeconds, 30);
        $options['stream'] = false;
        $options['verify'] = $options['verify'] ?? (bool)$config->get('verify_host_cert', true);
        if ($config->get('host_cert') !== null) {
            $options['cert'] = $config->get('host_cert');
        }
        // Build a fresh original StreamHandler. No retry middleware is added;
        // this also avoids an already-initialized session client's retry stack.
        $stack = HandlerStack::create(new StreamHandler());
        $stack->push(function (callable $handler): callable {
            return function (RequestInterface $request, array $options) use ($handler) {
                $requestBody = (string)$request->getBody();
                $sequence = $this->journal->beginHttp($request);
                // Observing a stream must not advance the body sent to Pantheon.
                $request = $request->withBody(Utils::streamFor($requestBody));
                return $handler($request, $options)->then(
                    function (ResponseInterface $response) use ($sequence) {
                        $body = (string)$response->getBody();
                        $this->journal->response($sequence, $response, $body);
                        // The native parser receives every original response byte.
                        return $response->withBody(Utils::streamFor($body));
                    },
                    function ($reason) use ($sequence) {
                        $this->journal->transportError($sequence, $reason);
                        return Create::rejectionFor($reason);
                    }
                );
            };
        }, 'govhub-native-receipt');
        $options['handler'] = $stack;
        // Do not run an inherited callback that might retry or disclose private
        // provider data outside this original operation's custody.
        unset($options['on_stats'], $options['on_headers'], $options['debug']);
        $this->client = new Client($options);
    }

    public function request($path, array $options = []): RequestOperationResult
    {
        $method = strtoupper((string)($options['method'] ?? 'GET'));
        $this->journal->beforeNative($method, (string)$path, $options);
        $reporting = error_reporting();
        try {
            // Native request() performs its own 401 refresh/reissue. Calling
            // this original public primitive preserves auth/JSON semantics
            // without submitting the selected workflow a second time.
            $result = parent::requestWithoutRefreshHandling($path, $options);
            $this->lastResult = $result;
            if ($result->isError()) {
                throw new \RuntimeException(
                    'Pantheon returned HTTP ' . $result->getStatusCode() . ' '
                    . $result->getStatusCodeReason() . '. The original response body is retained.',
                    $result->getStatusCode()
                );
            }
            return $result;
        } finally {
            error_reporting($reporting);
        }
    }

    public function lastResult(): ?RequestOperationResult
    {
        return $this->lastResult;
    }
}
