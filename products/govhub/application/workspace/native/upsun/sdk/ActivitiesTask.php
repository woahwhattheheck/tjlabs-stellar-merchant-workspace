<?php

namespace Upsun\Core\Tasks;

use Exception;
use Generator;
use Http\Discovery\Psr17FactoryDiscovery;
use Psr\Http\Client\ClientExceptionInterface;
use Upsun\Api\ApiException;
use Upsun\Api\EnvironmentActivityApi;
use Upsun\Api\ProjectActivityApi;
use Upsun\Model\AcceptedResponse;
use Upsun\Model\Activity;
use Upsun\UpsunClient;

/**
 * ActivitiesTask class.
 *
 * @author    Upsun Advocacy Team
 * @license   MIT
 * @see       https://docs.upsun.com
 */
class ActivitiesTask extends TaskBase
{
    public function __construct(
        UpsunClient $client,
        private readonly ProjectActivityApi $prjApi,
        private readonly EnvironmentActivityApi $envApi
    ) {
        parent::__construct($client);
    }

    /**
     * Cancel a project (or environment) activity
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     */
    public function cancel(
        string $projectId,
        string $activityId,
        ?string $environmentId = null
    ): AcceptedResponse {
        $this->checkProjectId($projectId);
        $this->checkActivityId($activityId);

        if (!$environmentId) {
            return $this->prjApi->actionProjectsActivitiesCancel(projectId: $projectId, activityId: $activityId);
        } else {
            return $this->envApi->actionProjectsEnvironmentsActivitiesCancel(
                projectId: $projectId,
                environmentId: $environmentId,
                activityId: $activityId
            );
        }
    }

    /**
     * Get a project (or environment) activity log entry
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     */
    public function get(string $projectId, string $activityId, ?string $environmentId = null): Activity
    {
        $this->checkProjectId($projectId);
        $this->checkActivityId($activityId);

        if (!$environmentId) {
            return $this->prjApi->getProjectsActivities(
                projectId: $projectId,
                activityId: $activityId
            );
        }

        $this->checkEnvironmentId($environmentId);
        return $this->envApi->getProjectsEnvironmentsActivities(
            projectId: $projectId,
            environmentId: $environmentId,
            activityId: $activityId
        );
    }

    /**
     * Get project (or environment) activity log
     *
     * @throws ClientExceptionInterface
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @return Activity[]
     */
    public function list(string $projectId, ?string $environmentId = null): array
    {
        $this->checkProjectId($projectId);

        if (!$environmentId) {
            return $this->prjApi->listProjectsActivities(projectId: $projectId);
        }

        $this->checkEnvironmentId($environmentId);
        return $this->envApi->listProjectsEnvironmentsActivities(
            projectId: $projectId,
            environmentId: $environmentId
        );
    }

    /**
     * Stream a project (or environment) activity log in real-time
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @return Generator<string>
     */
    public function log(
        string $projectId,
        string $activityId,
        ?string $environmentId = null,
        bool $stream = true
    ): Generator {
        $this->checkProjectId($projectId);
        $this->checkActivityId($activityId);

        if ($environmentId) {
            $this->checkEnvironmentId($environmentId);
        }

        $resourcePath = $environmentId
            ? \sprintf(
                '/projects/%s/environments/%s/activities/%s/log',
                $projectId,
                $environmentId,
                $activityId
            )
            : \sprintf('/projects/%s/activities/%s/log', $projectId, $activityId);

        $query = $stream ? '?stream=1' : '';
        $uri = rtrim($this->client->apiConfig->getHost(), '/') . $resourcePath . $query;

        $requestFactory = Psr17FactoryDiscovery::findRequestFactory();
        $request = $requestFactory->createRequest('GET', $uri);

        try {
            $authorization = $this->client->auth->getAuthorization();
        } catch (Exception $exception) {
            throw new ApiException(
                sprintf('[%s] %s', $exception->getCode(), $exception->getMessage()),
                $request,
                null,
                $exception
            );
        }

        $request = $request
            ->withHeader('Authorization', $authorization)
            ->withHeader('Accept', 'text/plain');

        try {
            $response = $this->client->apiClient->sendRequest($request);
        } catch (ClientExceptionInterface $exception) {
            throw new ApiException(
                sprintf('[%d] %s', $exception->getCode(), $exception->getMessage()),
                $request,
                null,
                $exception
            );
        }

        if ($response->getStatusCode() >= 400) {
            throw new ApiException(
                sprintf(
                    '[%d] Error connecting to the API (%s)',
                    $response->getStatusCode(),
                    $resourcePath
                ),
                $request,
                $response
            );
        }

        $body = $response->getBody();
        $buffer = '';

        while (!$body->eof()) {
            $chunk = $body->read(8192);
            if ($chunk === '') {
                usleep(10000);
                continue;
            }

            $buffer .= $chunk;
            while (($pos = strpos($buffer, "\n")) !== false) {
                $line = substr($buffer, 0, $pos);
                $buffer = substr($buffer, $pos + 1);
                yield rtrim($line, "\r");
            }
        }

        if ($buffer !== '') {
            yield rtrim($buffer, "\r");
        }
    }
}
