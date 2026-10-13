<?php

namespace Upsun\Core\Tasks;

use DateTime;
use DateTimeInterface;
use InvalidArgumentException;
use Upsun\UpsunClient;

/**
 * TaskBase class.
 *
 * @author    Upsun Advocacy Team
 * @license   MIT
 * @see       https://docs.upsun.com
 */
abstract class TaskBase
{
    public function __construct(
        protected UpsunClient $client,
    ) {
    }

    protected static function checkUserId(string $userId): void
    {
        if (trim($userId) === '') {
            throw new InvalidArgumentException('User ID is required');
        }
    }

    protected static function checkProjectId(string $projectId): void
    {
        if (trim($projectId) === '') {
            throw new InvalidArgumentException('Project ID is required');
        }
    }

    protected static function checkOrganizationId(string $organizationId): void
    {
        if (trim($organizationId) === '') {
            throw new InvalidArgumentException('Organization ID is required');
        }
    }

    protected static function checkEnvironmentId(string $environmentId): void
    {
        if (trim($environmentId) === '') {
            throw new InvalidArgumentException('Environment ID is required');
        }
    }

    protected static function checkActivityId(string $activityId): void
    {
        if (trim($activityId) === '') {
            throw new InvalidArgumentException('Activity ID is required');
        }
    }

    protected static function checkApplicationId(string $applicationId): void
    {
        if (trim($applicationId) === '') {
            throw new InvalidArgumentException('Application ID is required');
        }
    }

    protected static function checkBackupId(string $backupId): void
    {
        if (trim($backupId) === '') {
            throw new InvalidArgumentException('Backup ID is required');
        }
    }

    protected static function checkCertificateId(string $certificateId): void
    {
        if (trim($certificateId) === '') {
            throw new InvalidArgumentException('Certificate ID is required');
        }
    }

    protected static function checkSubscriptionId(string $subscriptionId): void
    {
        if (trim($subscriptionId) === '') {
            throw new InvalidArgumentException('Subscription ID is required');
        }
    }

    protected static function checkTeamId(string $teamId): void
    {
        if (trim($teamId) === '') {
            throw new InvalidArgumentException('Team ID is required');
        }
    }

    protected static function checkDeploymentId(string $deploymentId): void
    {
        if (trim($deploymentId) === '') {
            throw new InvalidArgumentException('Deployment ID is required');
        }
    }

    protected static function checkInvoiceId(string $invoiceId): void
    {
        if (trim($invoiceId) === '') {
            throw new InvalidArgumentException('Invoice ID is required');
        }
    }

    protected static function checkOrderId(string $orderId): void
    {
        if (trim($orderId) === '') {
            throw new InvalidArgumentException('Order ID is required');
        }
    }

    protected static function checkVoucherCode(string $code): void
    {
        if (trim($code) === '') {
            throw new InvalidArgumentException('Voucher code is required');
        }
    }

    protected static function checkProjectRegion(string $region): void
    {
        if (trim($region) === '') {
            throw new InvalidArgumentException('Project region is required');
        }
    }

    protected static function checkVariableId(string $variableId): void
    {
        if (trim($variableId) === '') {
            throw new InvalidArgumentException('Variable ID is required');
        }
    }

    protected static function checkRepositoryBlobId(string $repositoryBlobId): void
    {
        if (trim($repositoryBlobId) === '') {
            throw new InvalidArgumentException('Repository Blob ID is required');
        }
    }

    protected static function checkRepositoryCommitId(string $repositoryCommitId): void
    {
        if (trim($repositoryCommitId) === '') {
            throw new InvalidArgumentException('Repository Commit ID is required');
        }
    }

    protected static function checkRepositoryRefId(string $repositoryRefId): void
    {
        if (trim($repositoryRefId) === '') {
            throw new InvalidArgumentException('Repository Ref ID is required');
        }
    }

    protected static function checkRepositoryTreeId(string $repositoryTreeId): void
    {
        if (trim($repositoryTreeId) === '') {
            throw new InvalidArgumentException('Repository Tree ID is required');
        }
    }

    protected static function checkIntegrationId(string $integrationId): void
    {
        if (trim($integrationId) === '') {
            throw new InvalidArgumentException('Integration ID is required');
        }
    }

    protected static function checkDomainId(string $domainId): void
    {
        if (trim($domainId) === '') {
            throw new InvalidArgumentException('Domain ID is required');
        }
    }

    protected static function checkApiTokenId(string $tokenId): void
    {
        if (trim($tokenId) === '') {
            throw new InvalidArgumentException('API Token ID is required');
        }
    }

    protected static function checkEmail(string $email): void
    {
        if (trim($email) === '') {
            throw new InvalidArgumentException('Email is required');
        }

        if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $email)) {
            throw new InvalidArgumentException('Invalid email format');
        }
    }

    protected static function checkInviteId(string $inviteId): void
    {
        if (trim($inviteId) === '') {
            throw new InvalidArgumentException('Invite ID is required');
        }
    }

    protected static function checkUsername(string $username): void
    {
        if (trim($username) === '') {
            throw new InvalidArgumentException('Username is required');
        }
    }

    protected static function checkSshKeyId(int $keyId): void
    {
        if (!$keyId || $keyId <= 0) {
            throw new InvalidArgumentException('Key ID must be a positive integer');
        }
    }

    protected static function checkEnvironmentTypeId(string $environmentTypeId): void
    {
        if (trim($environmentTypeId) === '') {
            throw new InvalidArgumentException('Environment Type ID is required');
        }
    }

    protected static function checkRouteId(string $routeId): void
    {
        if (trim($routeId) === '') {
            throw new InvalidArgumentException('Route ID is required');
        }
    }

    protected static function checkInvitationId(string $invitationId): void
    {
        if (trim($invitationId) === '') {
            throw new InvalidArgumentException('Invitation ID is required');
        }
    }

    protected static function checkTicketId(string $ticketId): void
    {
        if (trim($ticketId) === '') {
            throw new InvalidArgumentException('Ticket ID is required');
        }
    }

    protected function normalizeFilter(array|string|int|DateTime|null $value): array
    {
        if ($value === null) {
            return [];
        }

        if (is_array($value)) {
            return $value;
        }

        if ($value instanceof DateTime) {
            return ['eq' => $value->format(DateTimeInterface::ATOM)];
        }

        // string or int
        return ['eq' => (string) $value];
    }

    /**
     * Get SubscriptionId of a Project Licence Uri
     */
    protected function extractSubscriptionId(string $projectLicenceUri): string
    {
        $path = parse_url($projectLicenceUri, PHP_URL_PATH);
        return basename($path);
    }
}
