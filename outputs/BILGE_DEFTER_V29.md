# Bilge Defter v29 — sürüm yayılımı ve tek tık güncelleme

21 Eylül 2026. Bu sürüm yeni bir işlev dilimi değil, v27 derin incelemesinin kalan
bulguları ile v28 yayınının ortaya çıkardığı iki gerçek kusurun kapatılmasıdır.
Veri biçimi, kayıt şeması ve yedek biçimi değişmedi (sürüm 5 / yedek 7 korunur).
Tekrarlama, bildirim, eşitleme ve AI bu sürümde yoktur.

## Kapatılan kusurlar

### 1. Sürüm bilgisi yayılmıyordu (discovery #1842)

v28 yayınında `sw.js`, `release.json` ve `offline-assets.json` v28'e güncellendi ama
`index.html` içindeki rozet ve `exportNotebook` içindeki `appVersion` v27 kaldı.
Sonuç: canlı uygulama "v27" rozeti gösteriyor, güncelleme ekranı "Bu pencere v27 /
Sunucu v28" gibi yanlış uyumsuzluk bildiriyor, yeni yedeklere v27 damgası basılıyordu.

- `build-invited.cjs` artık `sw.js` VERSION değişince rozet ve `appVersion`'i
  otomatik eşitler; BOM'lu JSON dosyasını okurken düzeltir ve yazarken BOM üretmez.
- `offline-assets.json` içindeki BOM kaldırıldı. BOM'lu dosya `JSON.parse` ve
  `Response.json()` için geçersizdi; bu haliyle yayınlanmış olsaydı SW kurulumu
  "Release mismatch" ile sessizce başarısız olurdu. Canlı v28 dosyası BOM'suzdu;
  repo kopyası BOM'luydu — ikisi arasındaki bu fark kapatıldı.

### 2. "Güncellemeyi yükle" tek başına yeni sürümü açmıyordu

Önceki akış beklemedeki paketi yüklemek için yalnız `location.reload()` çağırıyordu.
Yenilenen sayfa hâlâ eski çalışanın istemcisi olduğundan eski kabuk yeniden açılıyor,
yeni sürüm hiçbir zaman devreye girmiyordu.

- `sw.js`: yalnız uygulamanın açık onay mesajına (`SKIP_WAITING`) yanıt veren
  dinleyici eklendi. Otomatik skipWaiting yoktur; açık defter kendiliğinden
  devralınmaz. `clients.claim` kullanılmaz.
- `pwa.js`: buton önce bütünlük doğrulamasından geçmiş beklemedeki çalışana
  `SKIP_WAITING` gönderir; çalışan etkinleşince pencere kendini yeniler. Açık
  sekmeleri kapatmadan tek tıkla güncelleme çalışır; eski "tüm pencereleri kapat"
  akışı da korunur.

## Doğrulama

- Yerel, dosyaların HTTP üzerinden sunulduğu iki origin senaryosuyla:
  güvenli loopback (SW + çevrim dışı) ve güvensiz LAN adresi (uyarı davranışı).
- 198 uygulama kontrolü geçti: genel 24, kayıt güvenliği 7, yedek önizleme 8,
  temizleme kurtarma 7, çöp kutusu 9, defterler 8, kâğıt/silgi 7, sonsuz kaydırma 5,
  medya 13, medya yerleşim 15, medya döndürme 15, ilk yerleşim 13, PDF 13,
  PDF yakınlaştırma 8, PDF dışa aktarma 10, planlayıcı 20, PWA 8, görünüm 8.
  Ek olarak güncelleme zinciri ve statik güncelleme denetimi fixture'ları geçti.
- PWA paketi: yeni tek tık akışı ayrıca sınandı — beklemedeki paket kurulur, kurulum
  penceresi "Güncellemeyi yükle" der, tek tık son yeni sürümü açar, notlar ve
  ilgisiz uygulama cache'leri korunur, bozuk paket bütünlük hatasıyla reddedilir.
- Canlı özel HTTPS: release.json, rozet, appVersion, sw.js ve offline-assets.json
  ayrı ayrı v29 ve BOM'suz doğrulandı. Davetli adreste Cloudflare Access kapısı
  ayakta; girişli içerik denetimi ayrı kullanıcı kabulüne bırakıldı.
- Fiziksel iPad/Android kabulü ve kullanıcının kurulu uygulama geçişi hâlâ bekliyor.

## Yayın

Her iki ayrı adreste aynı 216 dosyalık v29 çevrim dışı paket var:

- https://defter.bilgearena.com/
- https://klipper-2.tail1ade8e.ts.net:8443/

Release dizinleri: `/opt/bilge-defter-test/releases/20260921-v29-update-flow` ve
`/opt/bilge-defter-invited/releases/20260921-v29-update-flow`.

Yeni konteynerler: private `a3f58cc8f879a1f9a2258083db1576dcb235157c0d8a396e8e7e7dbd536e8e62`,
davetli `e9dac7b58f5578903f629046ee40ccd5c3753528461b4228717c602688ef340d`.
Önceki çalışan konteynerler `rollback-before-v29` adıyla durdurulmuş halde saklandı.

SHA256SUMS özeti: `bd007046fe934f4fb4c71f35729ec4044eeb85ef776b3504263b545b18383c02`.

Yayın öncesi önceki dizin, dosya özeti, konteyner kimliği ve imaj doğrulandı.
Sunulan dosyalar paketle karşılaştırıldı; diğer çalışan konteyner kimlikleri
değişmedi. Nginx yapılandırması iki profile de `private, no-store, no-transform`
olarak güncellendi (Cloudflare içerik değiştirmesine karşı). Bilge Arena, DNS,
Access/cache ve Tailscale ayarlarına dokunulmadı.

Güncelleme için kayıt tamamlandı bilgisini bekleyin, JSON yedeği alın; kurulum
penceresinden Güncellemeyi yükle ile tek tıkla geçin veya tüm Defter pencerelerini
kapatıp yeniden açın. Başlıkta v29 görünmeli; tarayıcı verilerini silmeyin.

## Sonraki dilim

Haftalık tekrarlanan dersler ve haftalık plan görünümü (V27 raporundaki tasarım
kapsamıyla). Tekrarlama, bildirim, eşitleme ve AI daha sonraki kapsamdır.
