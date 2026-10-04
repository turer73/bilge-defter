"""Production entry point. No synthetic identity routes or cookie shortcuts."""
from fastapi import FastAPI
from app.api.bilge_defter import router
from app.api.bilge_dictionary import router as dictionary_router
from app.api.bilge_defter_pdf import router as presentation_router

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.include_router(router)
app.include_router(dictionary_router)
app.include_router(presentation_router)


@app.middleware("http")
async def private_responses(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get("/health")
def health():
    return {"status": "ok", "service": "bilge-defter-accounts", "version": "v73", "account_protocol": "approval-v1"}
