# Bilge Defter bağımsız hesap servisi

26 Eylül 2026: bu dal **v57 aday kodudur; canlıya alınmadı**. Canlı hesap servisi
v50, davetli web v56 olarak korundu. Sözlük uçları aynı `account_guard` arkasına
eklendi. Yeni servis için tutarlı sözlük SQLite kopyası `/dictionaries` altında
salt-okunur mount edilmelidir; merkezi hafıza anahtarı/veritabanı verilmez.
Eski hesap veri/sır mount'ları korunmalı; yeni veritabanı oluşturulmamalıdır.
Windows ve ayrı Linux test dizininde 76 API testi geçti; üretim Python 3.12
imaj kabulü, mount doğrulaması ve gerçek onaylı kullanıcı kabulü henüz yapılmadı.
Sürüm ve yayın adımları: `docs/REPAIR_20260926.md`.

24 Eylül 2026 düzeltmesi: klasörün `v49` adı tarihseldir. Buradaki uygulama
kodundan üretilen `bilge-defter-accounts:v50` canlıdadır; web paketi v52'dir.
Kaynak Git kaydı `bilge-defter` deposunun teslim dalındadır. Bu, tam
`Codex-server` deposunun kopyası veya monolite birleştirme değildir.

Servis `app.main:app` ile başlar; gerçek SQLite adaptörü, JWT doğrulaması,
hesap/izin listesi ve yedek sürüm kontrolü içerir. `tests/browser_server.py`
yalnız yerel sentetik test sunucusudur, production Docker katmanına kopyalanmaz.

Canlı DB `/opt/bilge-defter-classroom-v49/data`, sırlar salt-okunur ayrı
mount üzerindedir. Repo bu verileri içermez. Canlıdan tekrar kurulum ancak
ayrı kapsamlı onay ve geri dönüş/yedek doğrulamasıyla yapılır.

## İlk kaynak alımının tarihsel kaydı

Kaynak: klipperos@100.84.251.49:/opt/linux-ai-server/app/api/bilge_defter.py

23 Eylül 2026 okunan sunucu HEAD: 911f07f6f42b889ecf3cf367b28e40185afcf7ec (master).
Başlangıç dosyası SHA-256: d5e0480a5bd2d12417836c40808ffae291c5c53518b5ec04004c6da50263950a.
Sunucudaki mevcut infra/monitoring/prometheus.yml değişikliği alınmadı/değiştirilmedi.

Bu klasör tam sunucu checkout'u değildir: yalnız Bilge Defter modülü ve bağımsız test adayıdır.
İlk alımda canlıya kopyalanmamıştı; sonraki v49/v50 yayınları üstte belirtilmiştir.
`.venv` ve test verileri dağıtım girdisi değildir.
