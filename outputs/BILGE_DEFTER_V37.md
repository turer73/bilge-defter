# Bilge Defter v37 — push bildirimi (eşitleme habercisi)

22 Eylül 2026. Push, hesap/eşitleme altyapısının üzerine kurulan "başka cihaz
yeni yedek yükledi" habercisidir. Gizlilik korunur: sunucu yalnız zaman
damgası bilir; içerik uçtan uca şifreli kalır ve push mesajı içerik taşımaz.

## Kullanım

- Davetli adreste eşitleme kilidi açılınca bildirim izni istenir ve cihaz
  push'a abone olur. Durum satırında "bildirimler açık / izin yok /
  desteklenmiyor" görünür.
- Başka bir cihaz (aynı hesap) yedek yüklediğinde bu cihaza "Bilge Defter
  güncellendi" bildirimi gider; bildirime dokununca uygulama açılır ve
  otomatik pull çalışır (SYNC_PULL).
- Yükleyen cihaz kendi bildirimini almaz (device_id ile ayrıştırılır; cihaz
  kimliği localStorage'da kalıcıdır).

## Güvenlik ve dürüst sınırlar

- Push yalnız HTTPS + servis çalışanı + izin olan ortamda çalışır: davetli
  adres ve Android/masaüstü tarayıcılar; iOS yalnız 16.4+ kurulu PWA'da.
  Desteklenmeyen ortamda uygulama içi mekanizma (v31) ve 5 sn denetim devam
  eder; push yokluğu eşitlemeyi bozmaz.
- Sunucu abonelik uçlarını (endpoint/p256dh/auth) saklar; not içeriği asla
  görmez. Ölü abonelikler 404/410 yanıtında otomatik temizlenir.
- VAPID anahtarları sunucuda 0600 dosyada tutulur/üretilir; env ile de
  verilebilir.

## Sunucu (Klipper linux-ai-server)

- `GET /vapid-key`, `POST /push-subscription`, yedek yüklemede diğer
  cihazlara pywebpush ile bildirim. Bağımlılık: pywebpush 2.0.3.
  Codex-server commit `689aaac`; 21 pytest.

## Doğrulama

- 25 uygulama paketi, 254 kontrol: önceki tüm paketler + push paketi
  (2 kontrol: VAPID abonelik + durum, cihaz kimliği kalıcılığı). Sunucu
  21 pytest (kimlik + yedek + push; izole DB, ağsız).
- Fixture paketleri geçti. Canlı: private v37 (rozet, sw.js push kodu);
  vapid-key başlıksız 401 fail-closed.
- Gerçek iki cihaz arası push + bildirim kabulü kullanıcıda bekliyor.

## Yayın

Her iki ayrı adreste aynı 217 dosyalık v37 çevrim dışı paket var:

- https://defter.bilgearena.com/
- https://klipper-2.tail1ade8e.ts.net:8443/

Release dizinleri: `/opt/bilge-defter-test/releases/20260921-v37-push` ve
`/opt/bilge-defter-invited/releases/20260921-v37-push`.

Yeni konteynerler: private `a2fffc09e696b80aabd7ba42f6316d841747da053c12d1e4862da700f13c0c7e`,
davetli `87c00c0baf7854c1fd07c055ce023d9177a3501efaa7c3e9710cea3e6578251c`.
Öncekiler `rollback-before-v37` olarak saklandı. SHA256SUMS özeti:
`c37245bdf00b68dd8789d84c65c66b1a30a7abdf7765593b1905f4f85c044b44`.

## Sonraki dilim

El yazısı tanıma / Türkçe-tıbbi sözlük ve AI; özgün PDF/vektör saklama;
pinch-zoom. Öncelik kullanıcı kabulüne göre.
