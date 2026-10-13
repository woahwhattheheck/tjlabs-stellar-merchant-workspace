<?php
declare(strict_types=1);
// SPDX-License-Identifier: MIT
namespace Tjl\CatalogueWorkspace\Source;

use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

final class RetainedHttpClient implements ClientInterface
{
    public function __construct(private ClientInterface $inner, private SourceContext $context) {}
    public function sendRequest(RequestInterface $request): ResponseInterface
    {
        return $this->context->request($request, fn (RequestInterface $actual) => $this->inner->sendRequest($actual));
    }
}
