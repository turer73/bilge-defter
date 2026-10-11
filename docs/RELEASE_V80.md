# v80 — Belge okuma, içe aktarma ve kayıt güvenilirliği

Bu belge yayın prosedürüdür; başarılı test, canlı yayın veya fiziksel iPad
kabulü kanıtı değildir. Önceki sürüm sonuçları v80'e taşınmaz. Son adayın
test/CI/stage/canlı raporları aynı kaynak commit'i, UI manifest'i ve source
receipt ile eşleşmelidir.

## Dar kapsam

- Sürekli PPTX sayfalarında görünür alana göre raster tutma: viewport-reader.js.
- Varlıkların sıralı okunması; PPTX hazırlığının hesap-kapsamlı geçici
  IndexedDB alanında tutulması: pptx/import-stage.js.
- Sonucu belirsiz içe aktarma sonrasında eski bellek durumunun başarılı disk
  kaydını ezmesini önleyen yazma karantinası ve yeniden açma yolu.
- Ortak raster ekleme yolundaki PPTX/BDPPTX ilk kaydının doğrulanmış görsel
  varlıklarıyla küçültülmesi; başarılı kalıcı kayıt öncesi eski runtime
  modelinin korunması. Ayrı PDF/JSON yükleme yollarının ilk kaydının aynı
  biçimde küçüldüğü iddia edilmez.
- Silinen sayfanın medya geçmişinin ve kapanan çöp panelinin gereksiz görsel
  referanslarını bırakması; önceki kopyayı geri almadan önce kullanıcı onayı.
- Aynı doğrulama çağrısında tekrarlı PDF başlığı okumalarının sınırlı paylaşımı
  ve doğrulama önbelleğinde sayı/metin ayrımı; `IMPORT_PERFORMANCE.md`.
- Numaralı sayfa paneli, alt çubuk yakınlaştırması, raster kalite eşikleri ve
  notların içerik sözleşmesi korunur. Tam ref-only/lazy not modeli bu sürümün
  kapsamı değildir; toplam iPad bellek sorununun tamamı çözülmüş sayılmaz.

Detay ve kanıt sınırları: VIEWPORT_READER.md, ASSET_READING.md,
PPTX_STAGING.md, IMPORT_RECOVERY.md, IMPORT_ASSETS.md, IMAGE_LIFETIME.md.

Yayın **web-only**: yalnız bilge-defter-invited-web ve atomik current hedefi
değişir. Yeni kök /opt/bilge-defter-classroom-v80; geri dönüş korunmuş **gerçek
v79 web**. API, kütüphane, dönüştürücü, Cloudflare, Tailscale ve sunucu DB'leri
değişmez. İstemci tarayıcısındaki mevcut hesap depoları ve yeni geçici staging
ayrı değerlendirilir; "web-only" tarayıcıda hiç depolama işlemi yok demek değildir.

## Kesin statik yönlendirme farkı

Yayımlanmış v79 nginx'inin diğer baytları, page-navigation.js konumu, v76
PPTX blok işaretleri, renderer CSP/hash'i, kimlik doğrulama ve hız sınırları
korunur. Mevcut 404 fallback'inin hemen önüne yalnız şu iki konum eklenir:

```nginx
location = /viewport-reader.js { try_files $uri =404; }
location = /pptx/import-stage.js { try_files $uri =404; }
```

Genel /pptx/ veya / yolu açılmaz. PPTX public kümesi önceki yedi dosya ve
import-stage.js olmak üzere tam sekiz dosyadır; vendor/runtime.js,
vendor/PROVENANCE.json ve test/araç dosyaları yayımlanmaz. Frame hâlâ ağsız,
aynı iki inline betik hash'ine bağlı sandbox/CSP ile çalışır.

## Yayımlanmış v79 geri dönüş pinleri

| Pin | Değer |
| --- | --- |
| Kaynak | 918aa5796110db12cb3950588fb17d521205dbf9 |
| Kök | /opt/bilge-defter-classroom-v79 |
| UI SHA256SUMS | d7bd2e689410e6e179b4f2335705a88281d210f2786b5cd172caf0a262f8aa87 |
| Nginx | fef07cabd01d263e9be63cf0ce42213b6ed562ca78a4ced8eb6130cc834dce00 |
| Renderer HTML | 97579fbec1a3c9b4f475ea739cf08418e554bbb508b71ab7ca63696e5562d18f |
| v79 source receipt | 9f92256300d554931e32b9af8a72bb94170d8a482ffa39525236ac5f84f71769 |
| v79 payload | bcf104cac619b5fb63bce073ebbc4825150c63aeef1e8ff822247d017c8c92aa |
| Web image | sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236 |

Kaynak dayanağı outputs/direct-pptx-release-v79/live-proof.json,
RELEASE_EVIDENCE.md ve **package/source-receipt.json** üçlüsüdür.
package-7ef4b78 ve package-945c271 eski stage denemeleridir; UI baytları aynı
olsa bile yayımlanmış kaynak commit'i olarak kullanılmaz. Mevcut
work/bilge-defter-invited-v79 yerel adaydır; rollback girdisi olamaz.
Builder önceki nginx'i sabit 918aa579 commit'indeki şablon/provenance ile
yeniden kurar ve yayımlanmış nginx hash'ine eşitliğini zorunlu tutar.

Global minimum-reader.json release v75 / minimum_reader v74 kalır.
Araç floor'u yazmaz; hazırlıkta kaydedilen bayt hash'ini doğrular. Bu yayının
otomatik rollback hedefi daha dar olarak yalnız v79'dur. Canlı current, eski
UI/nginx, web kimliği ve floor ayrıca tekrar ölçülmeden aktivasyon yapılmaz.

## Kaynak ve test kapıları

1. Aktif CLAIM, dal/HEAD, kullanıcı kapsamı ve dirty dosyalar doğrulanır.
   Ana oturum tek yürütücüdür; eşzamanlı paketleme/yayın yapılmaz.
2. Uygulama, SW/cache/release/offline manifest ve package sürümü v80 olur.
   build-invited iki yeni modülü pakete/offline listeye alır; kaynak ve
   build dosyaları birbirine eşit olmalıdır.
3. Yedi yeni performans/güvenilirlik süiti son dondurulmuş adayda geçer:
   verify-viewport-reader, verify-asset-reading, verify-pptx-staging,
   verify-import-recovery-sync, verify-import-assets, verify-image-lifetime,
   verify-pdf-validation.
   Negatif kontroller API adı eksikliği değil gerçek davranış nedeniyle kalır.
   Ham hata/başarısız denemeler korunur; kaynak değişince ilgili kanıt yenilenir.
4. verify-v80.cjs tarihsel regresyonları korur. verify-v80-check.cjs
   entegrasyon ve tools/prepare-compat-v79.cjs'nin immutable gerçek v79
   okuyucusuyla geri dönüş uyumluluğunu sınar. Eski okuyucu testleri bunun
   yerine sayılmaz. Geçici staging'in v79 tarafından kullanılmaması ile
   kalıcı defter kaydının v79 tarafından açılabilmesi ayrı sözleşmelerdir.
5. Slayt akışı/medya geri alma raster denetimleri DPR1/DPR2'de ve zorunlu
   Linux/WebKit ortamında tamamlanır. Eşikler, 54 raster denetimi ve eşlenik
   negatif kontrol korunur. Dosya farkı izinleri yalnız gerekçeli v80
   dosyalarına genişler; genel kaynak farkı veya piksel toleransı açılmaz.
6. python -B work/test_deploy_v80.py önceki güvenlik/rollback kontrollerini
   korur; iki yeni modül için eksik dosya, eksik/geniş/çift konum, önceden
   eklenmiş rota, eski rollback sürümü ve değiştirilmiş prior asset
   negatiflerini ekler. Docker/HTTP geçici sentetik verilerle mock edilir;
   tek başına canlı geri dönüş provası değildir.
7. Son kaynak, test, sürüm, CI ve yayın araçları commit edilir. Aynı SHA'nın
   bütün zorunlu CI işleri geçer; eski sürümün yeşil CI'ı kabul edilmez.
   CI'nın yedi yeni süiti ve ham artefaktlarını gerçekten çalıştırdığı denetlenir.

Test komutlarının burada bulunması çalıştırıldıkları anlamına gelmez.
Bu araçları hazırlayan alt oturum runtime/build/CI/stage/yayın çalıştırmaz;
sonuçların üreticisi ve dondurulmuş kaynak doğrulayıcısı yetkili ana oturumdur.

## Paket ve özel statik yedek

```text
python -B work/build-release-v80.py
sudo python3 -B /opt/bilge-defter-classroom-v80/deploy-v80.py prepare
```

Builder committed Git blob'larıyla eşleşen work/bilge-defter-invited-v80
paketinden deterministik payload üretir. Çıktı
outputs/direct-pptx-release-v80/package altında payload.tar.gz ve
source-receipt.json'dur. Mevcut çıktı üstüne yazılmaz. Paket sadece
UI/nginx ve iki yayın betiğidir; API, sunucu DB veya öğrenci notu içeremez.
Aktarım hash'leri ve paket receipt'i karşılaştırılır.

Prepare eski statik UI/nginx ile reader-floor'u prior-web.tar.gz içinde
korur; web ve diğer servis sözleşmelerini private/0700, dosya/0600 alanında
kaydeder. Sunucu DB açılmaz/kopyalanmaz. prior-web.tar.gz, web.json,
protected.json ve backup-receipt.json kısıtlı, Git-dışı off-host dizine alınır.
Gerçek hash ve yerel erişim izinleri ölçülünce aynı receipt
offhost-backups.json olarak sunucuya bırakılır. Inspect/env sırları
log/sohbet/CI artefaktına konmaz. Eksik veya başka kaynağa ait yedek reddedilir.

Web image, tam iki salt okunur bind, ağ, loopback port, kaynak sınırları,
CapDrop=ALL, tam CAP_CHOWN/CAP_SETGID/CAP_SETUID ve no-new-privileges korunur.

## Stage ve aktivasyon

```text
sudo python3 -B /opt/bilge-defter-classroom-v80/deploy-v80.py stage
```

Preview yalnız 127.0.0.1:18810'dadır. Tüm HTTP dosya hash'leri/offline
girdiler, renderer CSP/MIME, 16 anonim/sahte JWT reddi ve özel yolların 404
olması doğrulanır. Yeni viewport/staging modülleri zorunludur. Üretim web'i
durmaz; API/kütüphane/worker/floor parmakizleri değişmez.

Ana oturumun özel SSH forward'ı üzerinden BILGE_STAGE_ORIGIN=http://127.0.0.1:18820
ve work/verify-stage-v80.cjs ile gerçek stage baytları iki motorda sınanır.
Yalnız yerel sentetik onaylı whoami cevabı kullanılabilir; öğrenci notlarına,
gerçek hesap oturumuna ve dış ağa erişilmez. Sunum hazırlama/deftere
alma, yeniden açma, kalem kaydı, sayfa paneli ve zoom kontrolleri son manifest'e
bağlanır. İptal davranışı yerel verify-pptx-staging süitinde ayrıca sınanır.
SW testleri ayrıca çalışır; stage tarayıcı sonucu SW veya fiziksel
iPad kabulü değildir.

**Operatör kapısı:** son commit'in zorunlu CI'ı, receipt bağlı stage,
aynı manifest'li tarayıcı sonucu ve off-host yedek eşleştirilir. Deploy aracı
GitHub CI veya yerel tarayıcı raporunu kendiliğinden denetlemez; ana oturum
bu ayrı kontrolü atlayamaz.

```text
sudo python3 -B /opt/bilge-defter-classroom-v80/deploy-v80.py activate
sudo python3 -B /opt/bilge-defter-classroom-v80/deploy-v80.py verify
```

Eski v79 aynı ID ile bilge-defter-invited-web-rollback-v80 olarak tutulur.
Yeni web loopback18790'da doğrulanır; current atomik değiştirilir.
activation-started.json sonrası kör tekrar aktivasyon yapılmaz.
Başarısızlıkta yalnız kanıtlı sahip olunan web kimliklerine müdahale edilir.

## Geri dönüş ve kabul sınırı

```text
sudo python3 -B /opt/bilge-defter-classroom-v80/deploy-v80.py rollback
```

Geri alma aday UI/doğrulayıcı bozulsa da eski sağlam v79 dosyaları, receipt,
yedek, floor ve tam container kimliğiyle çalışır. HTTP/body/cache/CSP/auth
geri dönüşü aday betiğine bağımlı olmadan ölçülür. İlgisiz servis yeniden
başlaması raporlanır, bilinen eski web'i kurtarmaya veto olmaz; bilinmeyen ID
durdurulmaz. **Eski deploy-v79.py rollback komutu kullanılmaz; hiçbir DB
restore edilmez.** Geri dönüş notları eski yedekle değiştirmek değildir.

v79 bu performans, staging ve kayıt-karantinası düzeltmelerini içermez.
Rollback için gerçek v79 okuyucu testinin geçmesi şarttır. Öğrencilerin JSON
yedekleri bağımsız tutulmalıdır. V80'in geçici staging verisi not yedeği değildir.

Gerçek iPad'de 69/100 sayfalı sunum veya PDF seçimi, uzun kaydırma,
Apple Pencil/avuç içi, kaleme dönüş, yakınlaştırma, uygulamayı kapat/aç ve
JSON yedekten dönüş ayrıca kullanıcı kabulüdür. Masaüstü/WebKit ölçümü cihaz
RAM'i, pil, dokunma gecikmesi veya sorunsuz ders kullanımı garantisi vermez.
