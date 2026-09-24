"""LOOPBACK TEST HARNESS ONLY. Synthetic identity cookie replaces Cloudflare.
Never deploy this file. Uses a disposable database and blocks real push delivery.
"""
import base64
import os
import socket
import tempfile
from pathlib import Path
import conftest
import uvicorn
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from jose import jwt
from app.api import bilge_defter as bd

if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="bilge-accounts-test-") as temp:
        sock=socket.socket();sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
        os.environ["BILGE_DEFTER_DB"]=str(Path(temp)/"accounts.sqlite")
        os.environ["BILGE_DEFTER_ADMIN_EMAILS"]="owner@example.com"
        os.environ["BILGE_DEFTER_ORIGIN"]=f"http://127.0.0.1:{port}"
        os.environ["BILGE_DEFTER_REGISTRATION_MODE"]=os.environ.get("BILGE_TEST_REGISTRATION_MODE","application")
        bd.ACCESS_TEAM="test-team";bd.ACCESS_AUD="test-aud"
        key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        pub=key.public_key().public_numbers()
        enc=lambda x:base64.urlsafe_b64encode(x.to_bytes((x.bit_length()+7)//8,"big")).rstrip(b"=").decode()
        bd._fetch_certs=lambda:[{"kid":"test","kty":"RSA","alg":"RS256","n":enc(pub.n),"e":enc(pub.e)}]
        bd._notify_other_devices=lambda *args:None
        app=FastAPI()
        @app.middleware("http")
        async def synthetic_identity(request,call_next):
            email=request.cookies.get("synthetic-user")
            if email in {"owner@example.com","student@example.com","second@example.com"}:
                token=jwt.encode({"email":email,"sub":"id-"+email,"aud":"test-aud","iss":"https://test-team.cloudflareaccess.com","exp":4102444800},key,algorithm="RS256",headers={"kid":"test"})
                request.scope["headers"]=[(k,v) for k,v in request.scope["headers"] if k!=b"cf-access-jwt-assertion"]+[(b"cf-access-jwt-assertion",token.encode())]
            return await call_next(request)
        @app.post("/_test/login/{user}")
        def login(user:str):
            if user not in {"owner","student","second"}:raise HTTPException(400)
            response=JSONResponse({"test":True});response.set_cookie("synthetic-user",user+"@example.com",httponly=True,samesite="strict");return response
        app.include_router(bd.router)
        root=Path(os.environ.get("BILGE_TEST_ROOT") or Path(__file__).resolve().parents[3]/"work"/"bilge-defter-invited-v49")
        app.mount("/",StaticFiles(directory=root,html=True),name="test-ui")
        print(f"TEST_ORIGIN=http://127.0.0.1:{port}",flush=True)
        uvicorn.Server(uvicorn.Config(app,log_level="error",access_log=False)).run(sockets=[sock])
