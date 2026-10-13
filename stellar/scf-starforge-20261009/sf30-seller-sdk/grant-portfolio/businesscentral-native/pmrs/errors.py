"""Explicit operator and provider outcomes for the PMRS integration."""
class PMRSError(Exception):
    def __init__(self, code, message, *, details=None, status=400):
        super().__init__(message)
        self.code, self.details, self.status = code, details or {}, status
    def public(self):
        return {"code": self.code, "message": str(self), "details": self.details}

def require(condition, code, message, **details):
    if not condition:
        raise PMRSError(code, message, details=details)

class ProviderError(PMRSError):
    def __init__(self, code, message, *, http_status=None, dispatched=False,
                 response=None, retry_after=None):
        super().__init__(code, message, status=502, details={
            "http_status": http_status, "dispatched": bool(dispatched),
            "retry_after": retry_after, "response": response})
        self.http_status, self.dispatched = http_status, bool(dispatched)
