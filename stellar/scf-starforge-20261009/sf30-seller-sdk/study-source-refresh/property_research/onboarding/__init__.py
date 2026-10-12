"""Original Property survey-table onboarding operations."""
from .service import Onboarding


def handlers(workspace):
    service = Onboarding(workspace)
    return {
        "property.onboarding.fields": service.fields,
        "property.onboarding.source": service.source,
        "property.onboarding.plans": service.plans,
        "property.onboarding.plan.save": service.save,
        "property.onboarding.plan.read": service.read_plan,
        "property.onboarding.preview": service.preview,
        "property.onboarding.prepare": service.prepare,
        "property.onboarding.retained": service.retained,
        "property.onboarding.rows": service.rows,
        "property.onboarding.continuation": service.continuation,
    }
