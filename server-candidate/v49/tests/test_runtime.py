from fastapi.testclient import TestClient
from app.main import app


def test_production_runtime_has_no_test_login_or_docs():
    with TestClient(app) as c:
        assert c.get("/health").json()["account_protocol"]=="approval-v1"
        for path in ["/_test/login/owner","/docs","/openapi.json"]:
            assert c.get(path).status_code==404
        denied=c.get("/api/v1/bilge-defter/admin/members")
        assert denied.status_code==401 and denied.headers["cache-control"]=="no-store"
        assert c.post("/api/v1/bilge-defter/admin/students",json={"email":"x@example.com"}).status_code==403
