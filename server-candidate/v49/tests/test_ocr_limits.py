"""Decoder resource guards; subprocess is synthetic, not a handwriting benchmark."""
import base64
import struct
import subprocess
import threading
import zlib
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from app.api import bilge_defter as bd

def image(width=100, height=40, corrupt=False):
    header=b'IHDR'+struct.pack('>IIBBBBB',width,height,8,6,0,0,0)
    crc=zlib.crc32(header) ^ int(corrupt)
    raw=b'\x89PNG\r\n\x1a\n'+struct.pack('>I',13)+header+struct.pack('>I',crc)
    return bd.OcrRequest(image=base64.b64encode(raw).decode())

@pytest.fixture(autouse=True)
def local(monkeypatch):
    monkeypatch.setattr(bd,'_require_access',lambda token:{'id':'synthetic'})
    monkeypatch.setattr(bd,'_ocr_slots',threading.BoundedSemaphore(2))

@pytest.mark.parametrize('body,code',[(image(0,20),413),(image(2001,40),413),(image(40,2001),413),(image(corrupt=True),400),(bd.OcrRequest(image='a'),400),(bd.OcrRequest(image=base64.b64encode(b'\x89PNG\r\n\x1a\n').decode()),400)])
def test_reject_before_decoder(body,code,monkeypatch):
    def never(*args,**kwargs):
        pytest.fail('Invalid input reached decoder')
    monkeypatch.setattr(bd.subprocess,'run',never)
    with pytest.raises(HTTPException) as error:bd.ocr(body,'synthetic')
    assert error.value.status_code==code

def test_slot_busy_rejected_before_decoder(monkeypatch):
    assert bd._ocr_slots.acquire(False) and bd._ocr_slots.acquire(False)
    monkeypatch.setattr(bd.subprocess,'run',lambda *a,**k:pytest.fail('Busy decoder started'))
    with pytest.raises(HTTPException) as error:bd.ocr(image(),'synthetic')
    assert error.value.status_code==429 and error.value.headers['Retry-After']=='5'

@pytest.mark.parametrize('failure,code',[(FileNotFoundError(),503),(subprocess.TimeoutExpired('tesseract',30),422)])
def test_failures_release_capacity(failure,code,monkeypatch):
    def fail(*args,**kwargs):raise failure
    monkeypatch.setattr(bd.subprocess,'run',fail)
    with pytest.raises(HTTPException) as error:bd.ocr(image(),'synthetic')
    assert error.value.status_code==code
    assert bd._ocr_slots.acquire(False) and bd._ocr_slots.acquire(False)
    assert not bd._ocr_slots.acquire(False)

def test_decoder_limits_and_response(monkeypatch):
    def run(command,**kwargs):
        assert kwargs['timeout']==30 and kwargs['env']['OMP_THREAD_LIMIT']=='1'
        assert command==['tesseract','stdin','stdout','-l','tur','--psm','6']
        return SimpleNamespace(returncode=0,stdout='Anatomi'.encode())
    monkeypatch.setattr(bd.subprocess,'run',run)
    assert bd.ocr(image(),'synthetic')=={'text':'Anatomi'}

def test_oversized_output_not_silently_truncated(monkeypatch):
    monkeypatch.setattr(bd.subprocess,'run',lambda *a,**k:SimpleNamespace(returncode=0,stdout=b'a'*10001))
    with pytest.raises(HTTPException) as error:bd.ocr(image(),'synthetic')
    assert error.value.status_code==422
