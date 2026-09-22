# Bilge Defter v32 — hesap/kimlik altyapısı

22 Eylül 2026. Eşitleme diliminin ilk adımı: kimlik doğrulama altyapısı. Bu sürüm
hesap/kimlik hazırlığıdır; not verisi sunucuya GÖNDERİLMEZ, eşitleme yoktur.
"Notlar yalnız bu cihazda" sözü aynen korunur.

## Ne eklendi

- Sunucu (Klipper linux-ai-server): `GET /api/v1/bilge-defter/whoami`.
  Cloudflare Access `Cf-Access-Jwt-Assertion` başlığını RS256 + audience/issuer
  ile doğrular (JWKS 1 saat önbellekli, kid-miss'te yenilenir), doğrulanmış
  e-postayı döndürür ve `bilge_defter_users` tablosuna upsert eder. Başlıksız
  istekte (özel Tailscale adresi) cihaz kimliği döner. Eksik yapılandırmada
  fail-closed 503. 7 pytest (izole veritabanı, yerel RSA ile ağsız doğrulama).
- Uygulama: Kurulum ve çevrim dışı ekranında hesap satırı. Davetli adreste
  whoami çağrılır ve "Kimlik: e-posta (Cloudflare Access ile doğrulandı) ·
  Eşitleme sonraki dilimde" gösterilir; reddedilen/sonuçsuz yanıtta dürüst
  açıklama gösterilir, kimlik uydurulmaz. Özel adreste sunucuya hiç istek
  atılmaz, cihaz kimliği yazılır.
- Rota: davetli adreste `/api/v1/bilge-defter/*` nginx üzerinden
  `172.17.0.1:8420`'a aktarılır; Access başlığı olduğu gibi geçer. CORS'a
  defter.bilgearena.com eklendi.

## Dürüst sınırlar

- Kimlik yalnız bilgilendirmedir; notlar, planlar ve yedekler hâlâ cihazdadır.
- Sunucu e-postayı ve ilk/son görülme zamanını saklar; not içeriği asla almaz.
- Eşitleme sonraki dilimde; geldiğinde uçtan uca şifreli olacak şekilde
  tasarlandı (sunucu yalnız şifreli yığın görür).

## Doğrulama

- 21 uygulama paketi, 230 kontrol: genel 24 (güvensiz LAN origin), kayıt
  güvenliği 7, yedek önizleme 8, temizleme kurtarma 7, çöp kutusu 9, defterler 8,
  kâğıt/silgi 7, sonsuz kaydırma 5, medya 13, medya yerleşim 15, medya döndürme 15,
  ilk yerleşim 13, PDF 13, PDF yakınlaştırma 8, PDF dışa aktarma 10, planlayıcı 20,
  planlayıcı tekrar 17, planlayıcı hatırlatma 11, hesap 4, PWA 8, görünüm 8.
  Ayrıca güncelleme zinciri ve statik denetim fixture'ları geçti.
- Sunucu: 7 pytest (cihaz kimliği, geçerli Access, tekrar ziyaret upsert, çöp
  belirteç, yanlış audience, bilinmeyen kid, eksik yapılandırma fail-closed).
  Canlı: 18790 üzerinden rota 200, sahte Access başlığı 401, başlıksız cihaz
  kimliği; private adres v32 rozetiyle yayında.
- Fiziksel tablet kabulü ve gerçek e-posta oturumuyla whoami denetimi kullanıcıda.

## Yayın

Her iki ayrı adreste aynı 216 dosyalık v32 çevrim dışı paket var:

- https://defter.bilgearena.com/
- https://klipper-2.tail1ade8e.ts.net:8443/

Release dizinleri: `/opt/bilge-defter-test/releases/20260921-v32-identity` ve
`/opt/bilge-defter-invited/releases/20260921-v32-identity`.

Yeni konteynerler: private `490580247aa087bdc4b5d3cb987265df786dd44e24d2ed84d51140720d9cf7b5`,
davetli `c613e8d392ee7b78b1a33cdef03c692d23aa074f908fd35f2312981d7611acd4`.
Öncekiler `rollback-before-v32` olarak saklandı. SHA256SUMS özeti:
`ef7738d630cc38b6d7f233cd136a53dda77103da8de340b76c2b38f6bab76302`.

Sunucu tarafı Codex-server repoya işlendi (`bf5846b`); env'e
`BILGE_DEFTER_ACCESS_TEAM` / `BILGE_DEFTER_ACCESS_AUD` eklendi, servis
yeniden başlatıldı. Diğer konteyner kimlikleri değişmedi; Bilge Arena, DNS,
Access/cache ve Tailscale ayarlarına dokunulmadı.

## Sonraki dilim

Manuel, uçtan uca şifreli sunucu yedeği: "Sunucuya yedekle / Sunucudan yükle"
(passphrase + WebCrypto AES-GCM; sunucu yalnız şifreli yığın saklar). Ardından
otomatik cihazlar arası eşitleme.
