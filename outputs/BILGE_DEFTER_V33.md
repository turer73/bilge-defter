# Bilge Defter v33 — manuel uçtan uca şifreli sunucu yedeği

22 Eylül 2026. Eşitleme diliminin ikinci adımı: elle çalışan, uçtan uca şifreli
sunucu yedeği. Otomatik eşitleme sonraki dilimdedir; "notlar sunucuya gitmez"
sözü şifreleme ile korunur — sunucu yalnız şifreli yığın görür.

## Kullanım

- Araçlar → Yedek yükle ile önizleme açılınca (veya davetli adreste) yedek
  penceresinde "Sunucuya yedekle" ve "Sunucudan yükle" düğmeleri görünür.
  Yalnız defter.bilgearena.com adresinde çalışır; özel adreste gizlidir ve
  nedeni açıklanır.
- Yedekleme: parola istenir (en az 8 karakter), defter PBKDF2-SHA256 (250.000
  tur) + AES-256-GCM ile şifrelenir; sunucuya yalnız ciphertext/iv/salt/kdf
  gider. Kullanıcı başına en son tek kopya saklanır (5 MB sınır).
- Yükleme: aynı parola ile şifre çözülür, mevcut önizleme/onay akışına girer
  ("Mevcut defterin yerine yükle"). Yanlış parola ve boş sunucu dürüst mesajla
  bildirilir; defter değişmez.

## Güvenlik ve dürüst sınırlar

- Parola hiçbir yerde saklanmaz (yalnız oturum belleğinde türetilmiş anahtar).
  Parola kaybolursa sunucudaki yedek açılamaz; bu uyarı arayüzde yazılıdır.
- Sunucu düz metin almaz: yedek uçları Access kimliği ister (başlıksız istek
  fail-closed 401), gövdede yalnız base64 alanlar kabul edilir, içerik
  incelenmez. Sunucu yedeği JSON indirmenin yerini tutmaz (manuel ve tek
  kopyadır).
- Eşitleme yoktur; çakışma birleştirme yoktur. Yükleme mevcut defterin yerine
  geçer ve önce yerel geri dönüş kopyası alınır (mevcut güvenlik akışı).

## Sunucu (Klipper linux-ai-server)

- POST/GET `/api/v1/bilge-defter/backup`; `bilge_defter_backups` tablosu
  (kullanıcı başına upsert). 14 pytest (kimlik + yedek; izole DB, ağsız RSA).
  Codex-server commit `219e0d2`.

## Doğrulama

- 22 uygulama paketi, 235 kontrol: önceki tüm paketler + yeni sunucu yedeği
  paketi (5 kontrol): özel adreste gizlilik, POST gövdesinin düz metin
  içermemesi, Node tarafında aynı KDF ile şifre çözümü ve birebir defter,
  önizlemeli geri yükleme, yanlış parola, 404.
- Fixture paketleri geçti. Canlı: private v33 (rozet, sync-workspace.js),
  davetli yedek ucu başlıksız 401.
- Fiziksel tablet kabulü ve gerçek Access oturumuyla yedekleme/yükleme
  kullanıcıda bekliyor.

## Yayın

Her iki ayrı adreste aynı 217 dosyalık v33 çevrim dışı paket var:

- https://defter.bilgearena.com/
- https://klipper-2.tail1ade8e.ts.net:8443/

Release dizinleri: `/opt/bilge-defter-test/releases/20260921-v33-server-backup` ve
`/opt/bilge-defter-invited/releases/20260921-v33-server-backup`.

Yeni konteynerler: private `34d3fb568f2618db7412d9db42e92adfdec5358ee7ef6b134a0d144ab707386e`,
davetli `fc6126abbbfb2f890282b1d0f008a2694a193ad09ee4e4ce23d4817783cc995b`.
Öncekiler `rollback-before-v33` olarak saklandı. SHA256SUMS özeti:
`745d8e568971e63135a673cb0c4594847b31705beb686173c66a4f21bda28828`.

Nginx izin listesine sync-workspace.js eklendi (iki profile); yedek rotası
`/api/v1/bilge-defter/*` aynen korunuyor. Diğer konteyner kimlikleri değişmedi.

## Sonraki dilim

Otomatik cihazlar arası eşitleme: açılışta/kapanışta şifreli push/pull, cihaz
başına zaman damgası, çakışmada manuel seçim. Şifreleme ve kimlik altyapısı bu
dilimden hazır.
