<?php
declare(strict_types=1);

namespace Tjl\CatalogueWorkspace;

use Doctrine\ORM\EntityManagerInterface;
use Psr\Container\ContainerInterface;
use Sylius\Component\Core\Model\ProductInterface;
use Sylius\Component\Core\Model\ProductVariantInterface;
use Webgriffe\SyliusAkeneoPlugin\Event\ProductVariantPreValidateEvent;

/** Native entities remain the authority. No source value is coerced into a price. */
final class NativeCatalogue
{
    public function __construct(
        private EntityManagerInterface $em,
        private ContainerInterface $repositories,
        private ContainerInterface $factories,
        private \Symfony\Contracts\EventDispatcher\EventDispatcherInterface $events,
    ) {}

    public function validateScope(array $locales, array $channels): void
    {
        foreach (['locale' => $locales, 'channel' => $channels] as $kind => $codes) {
            foreach ($codes as $code) {
                if ($this->repositories->get($kind)->findOneBy(['code' => $code]) === null) {
                    throw new \InvalidArgumentException('Select an existing native Sylius ' . $kind . ': ' . $code);
                }
            }
        }
    }

    public function read(string $identifier, ?string $parent, array $locales, bool $lock = false): array
    {
        $variant = $this->repositories->get('variant')->findOneBy(['code' => $identifier]);
        $targetCode = $parent ?? $identifier;
        $product = $this->repositories->get('product')->findOneBy(['code' => $targetCode]);
        if ($lock && $variant !== null) {
            if (!$this->em->getConnection()->isTransactionActive()) { throw new \RuntimeException('Native catalogue import requires its original Doctrine transaction.'); }
            $this->em->lock($variant, \Doctrine\DBAL\LockMode::PESSIMISTIC_WRITE);
            $this->em->refresh($variant);
        }
        $previous = $variant?->getProduct();
        $legacy = $this->repositories->get('product')->findOneBy(['code' => $identifier]);
        if ($lock) {
            if (!$this->em->getConnection()->isTransactionActive()) {
                throw new \RuntimeException('Native catalogue import requires its original Doctrine transaction.');
            }
            $entities = [];
            foreach ([$variant, $product, $previous, $legacy] as $entity) {
                if ($entity !== null) { $entities[$entity::class . ':' . (string) $entity->getId()] = $entity; }
            }
            ksort($entities, SORT_STRING);
            foreach ($entities as $entity) {
                $this->em->lock($entity, \Doctrine\DBAL\LockMode::PESSIMISTIC_WRITE);
                $this->em->refresh($entity);
            }
        }
        $fields = [];
        $objects = [];
        $add = static function (array $selector, mixed $value, mixed $object = null) use (&$fields, &$objects): void {
            $id = Support::hash($selector);
            $fields[$id] = ['id' => $id, 'selector' => $selector, 'value' => $value, 'value_sha256' => Support::hash($value)];
            if ($object !== null) { $objects[$id] = $object; }
        };
        foreach (['product' => $product, 'variant' => $variant] as $name => $entity) {
            $add(['entity' => $name, 'kind' => 'enabled'], $entity?->isEnabled());
            $translations = [];
            foreach ($entity?->getTranslations() ?? [] as $translation) {
                $translations[$translation->getLocale()] = $translation;
            }
            $properties = $name === 'product'
                ? ['name', 'description', 'shortDescription', 'slug', 'metaKeywords', 'metaDescription']
                : ['name'];
            $allLocales = array_values(array_unique(array_merge($locales, array_keys($translations))));
            sort($allLocales, SORT_STRING);
            foreach ($allLocales as $locale) {
                foreach ($properties as $property) {
                    $translation = $translations[$locale] ?? null;
                    $getter = 'get' . ucfirst($property);
                    $value = $translation === null ? null : $translation->$getter();
                    $add(['entity' => $name, 'kind' => 'translation', 'locale' => $locale, 'property' => $property], $value, $translation);
                }
            }
        }
        $channels = [];
        foreach ($product?->getChannels() ?? [] as $channel) { $channels[] = $channel->getCode(); }
        sort($channels, SORT_STRING);
        $add(['entity' => 'product', 'kind' => 'channels'], $channels, $product?->getChannels()->toArray() ?? []);
        $taxons = [];
        foreach ($product?->getProductTaxons() ?? [] as $taxon) {
            $taxons[] = ['code' => $taxon->getTaxon()->getCode(), 'position' => $taxon->getPosition()];
        }
        usort($taxons, static fn ($a, $b) => strcmp($a['code'], $b['code']));
        $add(['entity' => 'product', 'kind' => 'taxons'], $taxons, $product?->getProductTaxons()->toArray() ?? []);
        foreach ($product?->getAttributes() ?? [] as $attribute) {
            $add(['entity' => 'product', 'kind' => 'attribute', 'code' => $attribute->getAttribute()->getCode(), 'locale' => $attribute->getLocaleCode()],
                $attribute->getValue(), $attribute);
        }
        foreach ($variant?->getChannelPricings() ?? [] as $price) {
            $add(['entity' => 'variant', 'kind' => 'pricing', 'channel' => $price->getChannelCode()],
                ['price' => $price->getPrice(), 'originalPrice' => $price->getOriginalPrice(), 'minimumPrice' => $price->getMinimumPrice()], $price);
        }
        foreach (['weight', 'width', 'height', 'depth', 'onHand', 'onHold', 'tracked', 'shippingRequired'] as $property) {
            $getter = in_array($property, ['tracked', 'shippingRequired'], true) ? 'is' . ucfirst($property) : 'get' . ucfirst($property);
            $add(['entity' => 'variant', 'kind' => 'scalar', 'property' => $property], $variant === null ? null : $variant->$getter());
        }
        ksort($fields, SORT_STRING);
        $snapshot = [
            'identifier' => $identifier, 'target_product_code' => $targetCode,
            'variant' => $this->entityIdentity($variant),
            'product' => $this->entityIdentity($product),
            'previous_product' => $this->entityIdentity($previous),
            'legacy_product' => $this->entityIdentity($legacy),
            'fields' => $fields,
            'product_options' => $this->codes($product?->getOptions() ?? []),
            'variant_options' => $this->codes($variant?->getOptionValues() ?? []),
            'images' => $this->images($product),
        ];
        return ['snapshot' => $snapshot, 'sha256' => Support::hash($snapshot), 'objects' => $objects];
    }

    public function validateRules(array $snapshot, array $rules, array $scope): array
    {
        if (!array_is_list($rules) || count($rules) > 10000) {
            throw new \InvalidArgumentException('Select explicit bounded field ownership decisions.');
        }
        $seen = [];
        foreach ($rules as $rule) {
            $id = Support::requiredString($rule, 'field_id', 64);
            $field = $snapshot['fields'][$id] ?? throw new \InvalidArgumentException('Select an original reviewed native field.');
            if (isset($seen[$id]) || !in_array($rule['owner'] ?? null, ['local', 'source'], true)) {
                throw new \InvalidArgumentException('Each native field has one explicit local/source owner.');
            }
            $seen[$id] = true;
            $selector = $field['selector'];
            $protected = (isset($selector['locale']) && $selector['locale'] !== null && !in_array($selector['locale'], $scope['locales'], true))
                || ($selector['kind'] === 'pricing' && !in_array($selector['channel'], $scope['channels'], true))
                || ($selector['kind'] === 'scalar' && in_array($selector['property'], ['onHand', 'onHold', 'tracked'], true));
            if ($protected && ($rule['owner'] !== 'local' || (array_key_exists('value', $rule) && Support::hash($rule['value']) !== $field['value_sha256']))) {
                throw new \InvalidArgumentException('This field is outside the selected editorial locale/channel scope or belongs to native stock; preserve its original local value.');
            }
            if (($rule['before_sha256'] ?? null) !== $field['value_sha256']) {
                throw new \RuntimeException('The field ownership decision no longer names its original local value.');
            }
            if ($rule['owner'] === 'source' && array_key_exists('value', $rule)) {
                throw new \InvalidArgumentException('Source-owned fields retain the native connector value without replacement.');
            }
            if (array_key_exists('value', $rule)) { $this->validateValue($field['selector'], $rule['value']); }
            if ($rule['owner'] === 'local' && $snapshot[$field['selector']['entity']] === null && !array_key_exists('value', $rule)) {
                throw new \InvalidArgumentException('A new native entity needs an explicit local value or source ownership.');
            }
        }
        return $rules;
    }

    public function applyLocal(ProductVariantPreValidateEvent $event, array $snapshot, array $objects, array $rules): void
    {
        foreach ($rules as $rule) {
            if ($rule['owner'] !== 'local') { continue; }
            $field = $snapshot['fields'][$rule['field_id']];
            $selector = $field['selector'];
            $value = array_key_exists('value', $rule) ? $rule['value'] : $field['value'];
            $entity = $selector['entity'] === 'product' ? $event->getProduct() : $event->getProductVariant();
            $object = $objects[$field['id']] ?? null;
            $this->validateValue($selector, $value);
            switch ($selector['kind']) {
                case 'enabled':
                    $entity->setEnabled($value);
                    break;
                case 'translation':
                    $translation = null;
                    foreach ($entity->getTranslations() as $candidate) {
                        if ($candidate->getLocale() === $selector['locale']) { $translation = $candidate; break; }
                    }
                    if ($translation === null) {
                        $translation = $object ?? $this->factories->get($selector['entity'] . '_translation')->createNew();
                        $translation->setLocale($selector['locale']);
                        $entity->addTranslation($translation);
                    }
                    $setter = 'set' . ucfirst($selector['property']);
                    $translation->$setter($value);
                    break;
                case 'scalar':
                    $setter = 'set' . ucfirst($selector['property']);
                    $entity->$setter($value);
                    break;
                case 'attribute':
                    $existing = null;
                    foreach ($entity->getAttributes() as $candidate) {
                        if ($candidate->getAttribute()->getCode() === $selector['code'] && $candidate->getLocaleCode() === $selector['locale']) {
                            $existing = $candidate; break;
                        }
                    }
                    $attributeValue = $existing ?? $object ?? $this->factories->get('attribute_value')->createNew();
                    if ($attributeValue->getAttribute() === null) {
                        $attribute = $this->repositories->get('attribute')->findOneBy(['code' => $selector['code']]);
                        if ($attribute === null) { throw new \RuntimeException('The selected original Sylius attribute disappeared.'); }
                        $attributeValue->setAttribute($attribute);
                    }
                    $attributeValue->setLocaleCode($selector['locale']);
                    $attributeValue->setValue($value);
                    $entity->addAttribute($attributeValue);
                    break;
                case 'pricing':
                    $price = null;
                    foreach ($entity->getChannelPricings() as $candidate) {
                        if ($candidate->getChannelCode() === $selector['channel']) { $price = $candidate; break; }
                    }
                    $price ??= $object ?? $this->factories->get('channel_pricing')->createNew();
                    $price->setChannelCode($selector['channel']);
                    foreach ($value as $key => $amount) {
                        $setter = 'set' . ucfirst($key);
                        $price->$setter($amount);
                    }
                    $entity->addChannelPricing($price);
                    break;
                case 'channels':
                    foreach ($entity->getChannels()->toArray() as $channel) { $entity->removeChannel($channel); }
                    foreach ($value as $code) {
                        $channel = $this->repositories->get('channel')->findOneBy(['code' => $code]);
                        if ($channel === null) { throw new \RuntimeException('An approved original channel disappeared.'); }
                        $entity->addChannel($channel);
                    }
                    break;
                case 'taxons':
                    $old = [];
                    foreach (is_array($object) ? $object : [] as $taxon) { $old[$taxon->getTaxon()->getCode()] = $taxon; }
                    foreach ($entity->getProductTaxons()->toArray() as $taxon) { $entity->removeProductTaxon($taxon); }
                    foreach ($value as $row) {
                        $taxon = $this->repositories->get('taxon')->findOneBy(['code' => $row['code']]);
                        if ($taxon === null) { throw new \RuntimeException('An approved original taxon disappeared.'); }
                        $relation = $old[$row['code']] ?? $this->factories->get('product_taxon')->createNew();
                        $relation->setTaxon($taxon);
                        $relation->setPosition($row['position']);
                        $entity->addProductTaxon($relation);
                    }
                    break;
                default: throw new \LogicException('Unknown native field selector.');
            }
        }
    }

    /** Preserve every locale/channel outside the explicitly selected cohort scope. */
    public function protectBoundary(ProductVariantPreValidateEvent $event, array $snapshot, array $objects, array $scope): void
    {
        $locales = $scope['locales'];
        $channels = $scope['channels'];
        $automatic = [];
        foreach ($snapshot['fields'] as $field) {
            $selector = $field['selector'];
            $outside = (isset($selector['locale']) && $selector['locale'] !== null && !in_array($selector['locale'], $locales, true))
                || ($selector['kind'] === 'pricing' && !in_array($selector['channel'], $channels, true))
                || ($selector['kind'] === 'scalar' && in_array($selector['property'], ['onHand', 'onHold', 'tracked'], true));
            if ($outside && $snapshot[$selector['entity']] !== null) {
                $automatic[] = ['field_id' => $field['id'], 'owner' => 'local', 'before_sha256' => $field['value_sha256']];
            }
        }
        foreach (['product' => $event->getProduct(), 'variant' => $event->getProductVariant()] as $name => $entity) {
            $oldLocales = [];
            foreach ($snapshot['fields'] as $field) {
                if ($field['selector']['entity'] === $name && $field['selector']['kind'] === 'translation' && isset($objects[$field['id']])) {
                    $oldLocales[$field['selector']['locale']] = true;
                }
            }
            foreach ($entity->getTranslations()->toArray() as $translation) {
                if (!in_array($translation->getLocale(), $locales, true) && !isset($oldLocales[$translation->getLocale()])) {
                    $entity->removeTranslation($translation);
                }
            }
        }
        $oldAttributes = [];
        $oldPrices = [];
        foreach ($snapshot['fields'] as $field) {
            if ($field['selector']['kind'] === 'attribute') { $oldAttributes[Support::hash($field['selector'])] = true; }
            if ($field['selector']['kind'] === 'pricing') { $oldPrices[$field['selector']['channel']] = true; }
        }
        foreach ($event->getProduct()->getAttributes()->toArray() as $attribute) {
            $locale = $attribute->getLocaleCode();
            $selector = ['entity' => 'product', 'kind' => 'attribute', 'code' => $attribute->getAttribute()->getCode(), 'locale' => $locale];
            if ($locale !== null && !in_array($locale, $locales, true) && !isset($oldAttributes[Support::hash($selector)])) {
                $event->getProduct()->removeAttribute($attribute);
            }
        }
        foreach ($event->getProductVariant()->getChannelPricings()->toArray() as $price) {
            if (!in_array($price->getChannelCode(), $channels, true) && !isset($oldPrices[$price->getChannelCode()])) {
                $event->getProductVariant()->removeChannelPricing($price);
            }
        }
        $this->applyLocal($event, $snapshot, $objects, $automatic);
        $channelSelector = Support::hash(['entity' => 'product', 'kind' => 'channels']);
        $before = $snapshot['fields'][$channelSelector]['value'];
        $desired = array_values(array_filter($before, static fn ($code) => !in_array($code, $channels, true)));
        foreach ($event->getProduct()->getChannels() as $channel) {
            if (in_array($channel->getCode(), $channels, true)) { $desired[] = $channel->getCode(); }
        }
        $desired = array_values(array_unique($desired));
        sort($desired, SORT_STRING);
        $this->applyLocal($event, $snapshot, $objects, [[
            'field_id' => $channelSelector, 'owner' => 'local',
            'before_sha256' => $snapshot['fields'][$channelSelector]['value_sha256'], 'value' => $desired,
        ]]);
    }

    public function disableSelected(string $identifier, array $expected, bool $disableProduct): array
    {
        $variant = $this->repositories->get('variant')->findOneBy(['code' => $identifier]);
        if (!$variant instanceof ProductVariantInterface) { throw new \RuntimeException('The selected original variant disappeared.'); }
        $variant->setEnabled(false);
        $product = $variant->getProduct();
        if ($disableProduct) {
            if ($product === null || count($product->getEnabledVariants()) > 0) {
                throw new \RuntimeException('The original parent still has enabled variants; its disable selection must be reviewed again.');
            }
            $product->setEnabled(false);
        }
        $changed = [['product_variant', $variant]];
        if ($disableProduct && $product !== null) { $changed[] = ['product', $product]; }
        foreach ($changed as [$name, $entity]) {
            $event = new \Sylius\Bundle\ResourceBundle\Event\ResourceControllerEvent($entity);
            $event->setArgument('catalogue_workspace_selected_missing', true);
            $this->events->dispatch($event, 'sylius.' . $name . '.pre_update');
            if ($event->isStopped()) { throw new \RuntimeException('The native resource workflow stopped the selected missing-record change.'); }
        }
        $this->em->flush();
        foreach ($changed as [$name, $entity]) {
            $event = new \Sylius\Bundle\ResourceBundle\Event\ResourceControllerEvent($entity);
            $event->setArgument('catalogue_workspace_selected_missing', true);
            $this->events->dispatch($event, 'sylius.' . $name . '.post_update');
        }
        return ['identifier' => $identifier, 'variant_enabled' => $variant->isEnabled(), 'product_enabled' => $product?->isEnabled()];
    }

    private function entityIdentity(?object $entity): ?array
    {
        if ($entity === null) { return null; }
        $result = ['class' => $this->em->getClassMetadata($entity::class)->getName(), 'id' => (string) $entity->getId(), 'code' => $entity->getCode(), 'enabled' => $entity->isEnabled()];
        if (method_exists($entity, 'getVersion')) { $result['version'] = $entity->getVersion(); }
        if (method_exists($entity, 'getVariants')) {
            $result['variants'] = $this->codes($entity->getVariants());
        }
        return $result;
    }

    private function codes(iterable $entities): array
    {
        $values = [];
        foreach ($entities as $entity) { $values[] = $entity->getCode(); }
        sort($values, SORT_STRING);
        return $values;
    }

    private function images(?ProductInterface $product): array
    {
        $values = [];
        foreach ($product?->getImages() ?? [] as $image) {
            $values[] = ['id' => (string) $image->getId(), 'type' => $image->getType(), 'path' => $image->getPath(),
                'variants' => method_exists($image, 'getProductVariants') ? $this->codes($image->getProductVariants()) : []];
        }
        usort($values, static fn ($a, $b) => strcmp($a['id'], $b['id']));
        return $values;
    }

    private function validateValue(array $selector, mixed $value): void
    {
        switch ($selector['kind']) {
            case 'enabled':
                if (!is_bool($value)) { throw new \InvalidArgumentException('Enabled is a native boolean.'); }
                break;
            case 'translation':
                if ($value !== null && (!is_string($value) || strlen($value) > 1000000)) {
                    throw new \InvalidArgumentException('Native editorial text must be text or null.');
                }
                break;
            case 'pricing':
                if (!is_array($value) || array_keys($value) !== ['price', 'originalPrice', 'minimumPrice']) {
                    throw new \InvalidArgumentException('Retain all three native channel pricing fields in their original minor units.');
                }
                foreach ($value as $amount) {
                    if ($amount !== null && (!is_int($amount) || $amount < 0)) { throw new \InvalidArgumentException('Native prices are nonnegative integer minor units or null.'); }
                }
                break;
            case 'channels': Support::strings($value, 'channels'); break;
            case 'taxons':
                if (!is_array($value) || !array_is_list($value)) { throw new \InvalidArgumentException('Select explicit native taxon positions.'); }
                $codes = [];
                foreach ($value as $row) {
                    $codes[] = Support::requiredString($row, 'code');
                    if (!is_int($row['position'] ?? null) || $row['position'] < 0) { throw new \InvalidArgumentException('Taxon positions must be nonnegative integers.'); }
                }
                Support::strings($codes, 'taxons');
                break;
            case 'scalar':
                if (in_array($selector['property'], ['tracked', 'shippingRequired'], true)) {
                    if (!is_bool($value)) { throw new \InvalidArgumentException('The native selected property is boolean.'); }
                } elseif (in_array($selector['property'], ['onHand', 'onHold'], true)) {
                    if (!is_int($value) || $value < 0) { throw new \InvalidArgumentException('The native inventory value is a nonnegative integer.'); }
                } elseif ($value !== null && !is_int($value) && !is_float($value)) {
                    throw new \InvalidArgumentException('The selected native dimension must be numeric or null.');
                }
                break;
            case 'attribute': Support::json($value); break;
            default: throw new \InvalidArgumentException('Unknown native field.');
        }
    }
}
