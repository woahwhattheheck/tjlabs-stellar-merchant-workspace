<?php

namespace Upsun\Core\Tasks;

use InvalidArgumentException;
use LogicException;
use Psr\Http\Client\ClientExceptionInterface;
use Upsun\Api\ApiException;
use Upsun\Api\DeploymentApi;
use Upsun\Api\EnvironmentApi;
use Upsun\Api\EnvironmentTypeApi;
use Upsun\Model\AcceptedResponse;
use Upsun\Model\Activity;
use Upsun\Model\Backup;
use Upsun\Model\Deployment;
use Upsun\Model\Domain;
use Upsun\Model\DomainCreateInput;
use Upsun\Model\DomainPatch;
use Upsun\Model\Environment;
use Upsun\Model\EnvironmentActivateInput;
use Upsun\Model\EnvironmentBranchInput;
use Upsun\Model\EnvironmentInitializeInput;
use Upsun\Model\EnvironmentMergeInput;
use Upsun\Model\EnvironmentPatch;
use Upsun\Model\EnvironmentSourceOperation;
use Upsun\Model\EnvironmentSynchronizeInput;
use Upsun\Model\EnvironmentType;
use Upsun\Model\EnvironmentVariable;
use Upsun\Model\HttpAccessPermissions2;
use Upsun\Model\ProjectVariable;
use Upsun\Model\Resources4;
use Upsun\Model\Resources5;
use Upsun\Model\Resources6;
use Upsun\Model\Resources7;
use Upsun\Model\Resources8;
use Upsun\Model\Route;
use Upsun\Model\ServiceRelationshipsValue;
use Upsun\UpsunClient;

/**
 * EnvironmentsTask class.
 *
 * @author    Upsun Advocacy Team
 * @license   MIT
 * @see       https://docs.upsun.com
 */
class EnvironmentsTask extends TaskBase
{
    public function __construct(
        UpsunClient $client,
        private readonly EnvironmentApi $envApi,
        private readonly EnvironmentTypeApi $typeApi,
        private readonly DeploymentApi $deploymentApi,
    ) {
        parent::__construct($client);
    }

    /**
     * Activate an environment
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     */
    public function activate(
        string $projectId,
        string $environmentId,
        ?string $init = null
    ): AcceptedResponse {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentId($environmentId);

        return $this->envApi->activateEnvironment(
            $projectId,
            $environmentId,
            new EnvironmentActivateInput(
                resources: new Resources4(init: $init)
            )
        );
    }

    /**
     * Branch an environment
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     */
    public function branch(
        string $projectId,
        string $environmentId,
        string $title,
        string $name,
        bool $cloneParent = true,
        string $type = Environment::TYPE_DEVELOPMENT,
        ?string $init = null,
    ): AcceptedResponse {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentId($environmentId);

        return $this->envApi->branchEnvironment(
            projectId: $projectId,
            environmentId: $environmentId,
            environmentBranchInput: new EnvironmentBranchInput(
                title: $title,
                name: $name,
                cloneParent: $cloneParent,
                type: $type,
                resources: new Resources5(init: $init),
            )
        );
    }

    /**
     * Deactivate an environment
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     */
    public function deactivate(string $projectId, string $environmentId): AcceptedResponse
    {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentId($environmentId);

        return $this->envApi->deactivateEnvironment($projectId, $environmentId);
    }

    /**
     * Delete an environment
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     */
    public function delete(string $projectId, string $environmentId): AcceptedResponse
    {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentId($environmentId);

        return $this->envApi->deleteEnvironment($projectId, $environmentId);
    }

    /**
     * Update the HTTP access permissions for the environment.
     *
     * @param array{
     *   isEnabled?: bool,
     *   permission: string,
     *   address: string,
     * } $addresses
     * @param array{
     *    login: string,
     *    password: string,
     *   } $basicAuth
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function httpAccess(
        string $projectId,
        string $environmentId,
        ?bool $isEnabled = true,
        ?array $addresses = null,
        ?array $basicAuth = null
    ): AcceptedResponse {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentId($environmentId);

        return $this->envApi->updateEnvironment(
            projectId: $projectId,
            environmentId: $environmentId,
            environmentPatch: new EnvironmentPatch(
                httpAccess: new HttpAccessPermissions2(
                    isEnabled: $isEnabled,
                    addresses: $addresses,
                    basicAuth: $basicAuth
                )
            )
        );
    }

    /**
     * Get details of a specific environment. The details include information about the environment's current status.
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function get(string $projectId, string $environmentId): Environment
    {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentId($environmentId);

        return $this->envApi->getEnvironment(
            $projectId,
            $environmentId
        );
    }

    /**
     * Get or Update details of the environment. If extra parameters are provided, the environment will be updated with
     * the specified parameters before returning the details.
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function info(
        string $projectId,
        string $environmentId,
        ?string $parent = null,
        ?string $name = null,
        ?string $title = null,
        ?array $attributes = null,
        ?string $type = null,
        ?bool $cloneParentOnCreate = null,
        ?array $httpAccess = null,
        ?bool $enableSmtp = null,
        ?bool $restrictRobots = null,
    ): Environment {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentId($environmentId);

        if (
            $parent !== null || $name !== null || $title !== null || $attributes !== null || $type !== null
            || $cloneParentOnCreate !== null || $httpAccess !== null || $enableSmtp !== null || $restrictRobots !== null
        ) {
            $this->update(
                projectId: $projectId,
                environmentId: $environmentId,
                name: $name,
                title: $title,
                attributes: $attributes,
                type: $type,
                cloneParentOnCreate: $cloneParentOnCreate,
                httpAccess: $httpAccess,
                enableSmtp: $enableSmtp,
                restrictRobots: $restrictRobots
            );
        }

        return $this->get($projectId, $environmentId);
    }

    /**
     * Initialize the environment by deploying code from a specified repository and profile, with optional configuration
     * and initialization parameters.
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function init(
        string $projectId,
        string $environmentId,
        string $profile,
        string $repository,
        string $fileMode,
        string $filePath,
        string $fileContents,
        ?string $config = null,
        ?string $init = Resources6::INIT__DEFAULT,
    ): AcceptedResponse {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentId($environmentId);

        $environmentInitializeInput = new EnvironmentInitializeInput(
            profile: $profile,
            repository: $repository,
            files: [
                $fileMode,
                $filePath,
                $fileContents
            ],
            config: $config,
            resources: new Resources6(init: $init),
        );
        return $this->envApi->initializeEnvironment(
            projectId: $projectId,
            environmentId: $environmentId,
            environmentInitializeInput: $environmentInitializeInput
        );
    }

    /**
     * Get list of project environments
     *
     * @throws ClientExceptionInterface
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws InvalidArgumentException if required parameters are missing or invalid
     * @return Environment[]
     */
    public function list(string $projectId): array
    {
        $this->checkProjectId($projectId);

        return $this->envApi->listProjectsEnvironments(projectId: $projectId);
    }

    //TODO logs
    public function logs(string $projectId, string $environmentId, string $appName): array
    {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentId($environmentId);

        throw new LogicException('Not implemented yet');
    }

    /**
     * Merge an environment
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function merge(string $projectId, string $environmentId, ?string $init = Resources7::INIT__DEFAULT): AcceptedResponse
    {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentId($environmentId);

        return $this->envApi->mergeEnvironment(
            $projectId,
            $environmentId,
            environmentMergeInput: new EnvironmentMergeInput(
                resources: new Resources7(init: $init)
            )
        );
    }

    /**
     * Pause an environment
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function pause(string $projectId, string $environmentId): AcceptedResponse
    {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentId($environmentId);

        return $this->envApi->pauseEnvironment(projectId: $projectId, environmentId: $environmentId);
    }

    /**
     * Redeploy an environment
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function redeploy(string $projectId, string $environmentId): AcceptedResponse
    {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentId($environmentId);

        return $this->envApi->redeployEnvironment(projectId: $projectId, environmentId: $environmentId);
    }

    /**
     * Get the relationships of an environment, which include the linked applications or services.
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     * @return ServiceRelationshipsValue[]
     */
    public function relationships(string $projectId, string $environmentId, string $applicationId): array
    {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentId($environmentId);

        $appConfig = $this->client->applications->configGet(
            $projectId,
            $environmentId,
            $applicationId
        );

        return $appConfig?->getRelationships() ?? [];
    }

    /**
     * Resume a paused environment
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function resume(string $projectId, string $environmentId): AcceptedResponse
    {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentId($environmentId);

        return $this->envApi->resumeEnvironment(projectId: $projectId, environmentId: $environmentId);
    }

    /**
     * Synchronize a child environment with its parent
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function synchronize(
        string $projectId,
        string $environmentId,
        bool $synchronizeCode = true,
        bool $rebase = true,
        bool $synchronizeData = true,
        bool $synchronizeResources = true,
    ): AcceptedResponse {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentId($environmentId);

        return $this->envApi->synchronizeEnvironment(
            $projectId,
            $environmentId,
            environmentSynchronizeInput: new EnvironmentSynchronizeInput(
                synchronizeCode: $synchronizeCode,
                rebase: $rebase,
                synchronizeData: $synchronizeData,
                synchronizeResources: $synchronizeResources
            )
        );
    }

    /**
     * Update an environment
     *
     * @param null|array{
     *   isEnabled?: bool,
     *   addresses?: array{
     *     permission: string,
     *     address: string,
     *   },
     *   basicAuth?: array{
     *    login: string,
     *    password: string,
     *   }
     * } $httpAccess
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function update(
        string $projectId,
        string $environmentId,
        ?string $parent = null,
        ?string $name = null,
        ?string $title = null,
        ?array $attributes = null,
        ?string $type = null,
        ?bool $cloneParentOnCreate = null,
        ?array $httpAccess = null,
        ?bool $enableSmtp = null,
        ?bool $restrictRobots = null,
    ): AcceptedResponse {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentId($environmentId);

        return $this->envApi->updateEnvironment(
            projectId: $projectId,
            environmentId: $environmentId,
            environmentPatch: new EnvironmentPatch(
                parent: $parent,
                name: $name,
                title: $title,
                attributes: $attributes,
                type: $type,
                cloneParentOnCreate: $cloneParentOnCreate,
                httpAccess: isset($httpAccess) ? new HttpAccessPermissions2(
                    isEnabled: $httpAccess['isEnabled'] ?? null,
                    addresses: $httpAccess['addresses'] ?? null,
                    basicAuth: $httpAccess['basicAuth'] ?? null
                ) : null,
                enableSmtp: $enableSmtp,
                restrictRobots: $restrictRobots
            )
        );
    }

    /**
     * Cancel an ongoing activity on the environment, such as deployment, synchronization, etc.
     * The cancellation will be best-effort and may not succeed if the activity is too close to completion.
     * The API will return a 202 Accepted response if the cancellation request has been accepted,
     * but the client should check the environment's current activities to confirm whether the cancellation was
     * successful or not.
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function activityCancel(string $projectId, string $environmentId, string $activityId): AcceptedResponse
    {
        return $this->client->activities->cancel(
            projectId: $projectId,
            activityId: $activityId,
            environmentId: $environmentId
        );
    }

    /**
     * Get an environment activity log entry
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
    */
    public function getActivity(string $projectId, string $environmentId, string $activityId): Activity
    {
        return $this->client->activities->get(
            projectId: $projectId,
            activityId: $activityId,
            environmentId: $environmentId
        );
    }

    /**
     * Get an environment activity log entry
     *
     * @deprecated use getActivity instead
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function getActivities(string $projectId, string $environmentId, string $activityId): Activity
    {
        return $this->getActivity(
            projectId: $projectId,
            activityId: $activityId,
            environmentId: $environmentId
        );
    }

    /**
     * Get environment activity log
     *
     * @throws ClientExceptionInterface
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws InvalidArgumentException if required parameters are missing or invalid
     * @return Activity[]
     */
    public function listActivities(string $projectId, string $environmentId): array
    {
        return $this->client->activities->list(projectId: $projectId, environmentId: $environmentId);
    }

    /**
     * Create snapshot of environment
     * Trigger a backup of the environment. The backup will be created asynchronously, and the API will return
     * a 202 Accepted response if the backup request has been accepted. The client can then check the list of backups to
     * monitor the progress and confirm when the backup is completed.
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function backup(
        string $projectId,
        string $environmentId,
        bool $isSafe
    ): AcceptedResponse {
        return $this->client->backups->create(projectId: $projectId, environmentId: $environmentId, isSafe: $isSafe);
    }

    /**
     * List all backups of the environment.
     *
     * @throws ClientExceptionInterface
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws InvalidArgumentException if required parameters are missing or invalid
     * @return Backup[]
     */
    public function listBackups(string $projectId, string $environmentId): array
    {
        return $this->client->backups->list(projectId: $projectId, environmentId: $environmentId);
    }

    /**
     * Delete an environment snapshot
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function deleteBackup(string $projectId, string $environmentId, string $backupId): AcceptedResponse
    {
        return $this->client->backups->delete(
            projectId: $projectId,
            environmentId: $environmentId,
            backupId: $backupId
        );
    }

    /**
     * Get an environment snapshot's info
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function getBackup(string $projectId, string $environmentId, string $backupId): Backup
    {
        return $this->client->backups->get(
            projectId: $projectId,
            environmentId: $environmentId,
            backupId: $backupId
        );
    }

    /**
     * Restore an environment snapshot
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function restoreBackup(
        string $projectId,
        string $environmentId,
        string $backupId,
        bool $restoreCode = true,
        bool $restoreResources = true,
        ?string $environmentName = null,
        ?string $branchFrom = null,
        ?string $init = Resources8::INIT__DEFAULT,
    ): AcceptedResponse {
        return $this->client->backups->restore(
            projectId: $projectId,
            environmentId: $environmentId,
            backupId: $backupId,
            restoreCode: $restoreCode,
            restoreResources: $restoreResources,
            environmentName: $environmentName,
            branchFrom: $branchFrom,
            init: $init
        );
    }

    /**
     * Get details of a specific environment type, such as development, production, etc.
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function getType(string $projectId, string $environmentTypeId): EnvironmentType
    {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentTypeId($environmentTypeId);

        return $this->typeApi->getEnvironmentType(projectId: $projectId, environmentTypeId: $environmentTypeId);
    }

    /**
     * List all environment types available in the project. Environment types represent different categories or
     * classifications of environments, such as development, staging, production, etc. Each environment type may have
     * specific characteristics or configurations that differentiate it from other types.
     *
     * @throws ClientExceptionInterface
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws InvalidArgumentException if required parameters are missing or invalid
     * @return EnvironmentType[]
     */
    public function listTypes(string $projectId): array
    {
        $this->checkProjectId($projectId);

        return $this->typeApi->listProjectsEnvironmentTypes(projectId: $projectId);
    }

    /**
     * Create an environment variable in the environment. Environment variables are used to store configuration values
     * that can be accessed by the applications running in the environment. The name of the variable must be unique
     * within the environment. If a variable with the same name already exists, the API will return an error.
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function createVariable(
        string $projectId,
        string $environmentId,
        string $name,
        string $value,
        ?array $attributes = null,
        ?bool $isJson = null,
        ?bool $isSensitive = null,
        ?bool $visibleBuild = null,
        ?bool $visibleRuntime = null,
        ?array $applicationScope = null,
        ?bool $isEnabled = null,
        ?bool $isInheritable = null,
    ): AcceptedResponse {
        return $this->client->variables->createEnvironmentVariable(
            projectId: $projectId,
            environmentId: $environmentId,
            name: $name,
            value: $value,
            attributes: $attributes,
            isJson: $isJson,
            isSensitive: $isSensitive,
            visibleBuild: $visibleBuild,
            visibleRuntime: $visibleRuntime,
            applicationScope: $applicationScope,
            isEnabled: $isEnabled,
            isInheritable: $isInheritable,
        );
    }

    /**
     * Delete an environment variable
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function deleteVariable(string $projectId, string $environmentId, string $variableId): AcceptedResponse
    {
        return $this->client->variables->deleteEnvironmentVariable(
            projectId: $projectId,
            environmentId: $environmentId,
            variableId: $variableId
        );
    }

    /**
     * Get an environment variable
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function getVariable(string $projectId, string $environmentId, string $variableId): EnvironmentVariable
    {
        return $this->client->variables->getEnvironmentVariable(
            projectId: $projectId,
            environmentId: $environmentId,
            variableId: $variableId
        );
    }

    /**
     * Get list of Environment variables
     *
     * @throws ClientExceptionInterface
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws InvalidArgumentException if required parameters are missing or invalid
     * @return EnvironmentVariable[]
     */
    public function listVariables(string $projectId, string $environmentId): array
    {
        return $this->client->variables->listEnvironmentVariables(
            projectId: $projectId,
            environmentId: $environmentId
        );
    }

    /**
     * Get list of Environment variables
     *
     * @deprecated use listVariables instead
     * @throws ClientExceptionInterface
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws InvalidArgumentException if required parameters are missing or invalid
     * @return EnvironmentVariable[]
     */
    public function listEnvironmentVariables(string $projectId, string $environmentId): array
    {
        return $this->listVariables(
            projectId: $projectId,
            environmentId: $environmentId
        );
    }

    /**
     * Get list of Project variables
     *
     * @deprecated use $this->client->projects->listVariables instead
     * @throws ClientExceptionInterface
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws InvalidArgumentException if required parameters are missing or invalid
     * @return ProjectVariable[]
     */
    public function listProjectVariables(string $projectId): array
    {
        return $this->client->variables->listProjectVariables(projectId: $projectId);
    }

    /**
     * Update an environment variable
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function updateVariable(
        string $projectId,
        string $environmentId,
        string $variableId,
        ?string $name = null,
        ?string $value = null,
        ?array $attributes = null,
        ?bool $isJson = null,
        ?bool $isSensitive = null,
        ?bool $visibleBuild = null,
        ?bool $visibleRuntime = null,
        ?array $applicationScope = null,
    ): AcceptedResponse {
        return $this->client->variables->updateEnvironmentVariable(
            projectId: $projectId,
            environmentId: $environmentId,
            variableId: $variableId,
            name: $name,
            value: $value,
            attributes: $attributes,
            isJson: $isJson,
            isSensitive: $isSensitive,
            visibleBuild: $visibleBuild,
            visibleRuntime: $visibleRuntime,
            applicationScope: $applicationScope,
        );
    }

    /**
     * Get a route's info
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function getRoute(string $projectId, string $environmentId, string $routeId): Route
    {
        return $this->client->routes->get(projectId: $projectId, environmentId: $environmentId, routeId: $routeId);
    }

    /**
     * Get list of routes
     *
     * @throws ClientExceptionInterface
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws InvalidArgumentException if required parameters are missing or invalid
     * @return Route[]
     */
    public function listRoutes(string $projectId, string $environmentId): array
    {
        return $this->client->routes->list(projectId: $projectId, environmentId: $environmentId);
    }

    /**
     * Add an environment domain
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function addDomain(
        string $projectId,
        DomainCreateInput $domainCreateInput,
        ?string $environmentId = null,
    ): AcceptedResponse {
        return $this->client->domains->add(
            projectId: $projectId,
            domainCreateInput: $domainCreateInput,
            environmentId: $environmentId
        );
    }

    /**
     * Delete an environment domain
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function deleteDomain(string $projectId, string $environmentId, string $domainId): AcceptedResponse
    {
        return $this->client->domains->delete(
            projectId: $projectId,
            domainId: $domainId,
            environmentId: $environmentId
        );
    }

    /**
     * Get an environment domain
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function getDomain(string $projectId, string $environmentId, string $domainId): Domain
    {
        return $this->client->domains->get(projectId: $projectId, environmentId: $environmentId, domainId: $domainId);
    }

    /**
     * Get a list of environment domains
     *
     * @throws ClientExceptionInterface
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws InvalidArgumentException if required parameters are missing or invalid
     * @return Domain[]
     */
    public function listDomains(string $projectId, string $environmentId): array
    {
        return $this->client->domains->list(projectId: $projectId, environmentId: $environmentId);
    }

    /**
     * Update an environment domain
     *
     * @param DomainPatch $domainPatch is an instance of ProdDomainStoragePatch or ReplacementDomainStoragePatch
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function updateDomain(
        string $projectId,
        string $environmentId,
        string $domainId,
        DomainPatch $domainPatch,
    ): AcceptedResponse {
        return $this->client->domains->update(
            projectId: $projectId,
            domainId: $domainId,
            domainPatch: $domainPatch,
            environmentId: $environmentId
        );
    }

    /**
     * Get a single environment deployment
     *
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function getDeployment(string $projectId, string $environmentId, string $deploymentId): Deployment
    {
        $this->checkProjectId($projectId);
        $this->checkEnvironmentId($environmentId);
        $this->checkDeploymentId($deploymentId);

        return $this->deploymentApi->getProjectsEnvironmentsDeployments(
            projectId: $projectId,
            environmentId: $environmentId,
            deploymentId: $deploymentId
        );
    }

    /**
     * Get an environment's deployment information
     *
     * @throws ClientExceptionInterface
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @return Deployment[]
     */
    public function listDeployments(string $projectId, string $environmentId): array
    {
        return $this->deploymentApi->listProjectsEnvironmentsDeployments(
            projectId: $projectId,
            environmentId: $environmentId
        );
    }

    /**
     * List source operations
     *
     * @deprecated  use $client->sourceOperations->list() instead
     * @throws ClientExceptionInterface
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws InvalidArgumentException if required parameters are missing or invalid
     * @return EnvironmentSourceOperation[]
     */
    public function listSourceOperations(string $projectId, string $environmentId): array
    {
        return $this->client->sourceOperations->list(projectId: $projectId, environmentId: $environmentId);
    }

    /**
     * Trigger a source operation
     *
     * @deprecated use $client->sourceOperations->run() instead
     * @throws ApiException on non-2xx response or if the response body is not in the expected format
     * @throws ClientExceptionInterface
     * @throws InvalidArgumentException if required parameters are missing or invalid
     */
    public function runSourceOperation(
        string $projectId,
        string $environmentId,
        string $operation,
        array $variables,
    ): AcceptedResponse {
        return $this->client->sourceOperations->run(
            projectId: $projectId,
            environmentId: $environmentId,
            operation: $operation,
            variables: $variables
        );
    }
}
