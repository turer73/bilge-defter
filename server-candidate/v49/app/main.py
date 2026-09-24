"""Production entry point. No synthetic identity routes or cookie shortcuts."""
from fastapi import FastAPI
from app.api.bilge_defter import router

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.include_router(router)


@app.middleware("http")
async def private_responses(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get("/health")
def health():
    return {"status": "ok", "service": "bilge-defter-accounts", "version": "v50", "account_protocol": "approval-v1"}
