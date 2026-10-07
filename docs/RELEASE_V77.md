# v77 — PowerPoint'i ana deftere ekleme

Bu belge yayın prosedürüdür; tek başına canlı yayın veya fiziksel iPad kabulü
kanıtı değildir. Canlı sonuç aynı kaynak commit'i ve receipt'e bağlı
`live-proof.json` ile doğrulanır.

## Kapsam

- **Ekle → PowerPoint ekle → Sunum seç → N slaytı ekle**: slaytlar cihazda
  hazırlanıp mevcut deftere veya yeni deftere normal sayfalar olarak eklenir.
- Kalem, fosforlu, silgi, geri alma ve JSON yedek akışı normal defterin araçlarıdır.
  Mevcut sayfalar korunur; eski ayrı sunumlar silinmez. Ayrıntılar:
  [POWERPOINT_NOTEBOOK.md](POWERPOINT_NOTEBOOK.md).
- Yalnız `bilge-defter-invited-web` ve `current` değişir. Yeni kök
  `/opt/bilge-defter-classroom-v77`; geri dönüş hedefi mevcut **v76** web'dir.
- Accounts API, kütüphane, sunucu dönüştürücüsü, Cloudflare/Tailscale,
  kimlik doğrulama ve sunucu veritabanları değişmez. Öğrenci verisi pakete alınmaz.
- `minimum-reader.json` aynen kalır: release v75 / minimum okuyucu v74.
- Nginx'in mevcut v76 PPTX tam-yol bloğunda yalnız renderer CSP hash'i güncellenir.
  Auth/proxy/yükleme/rate-limit ve diğer yolların baytları korunur. Genel `/pptx/`
  dizin izni yoktur. Çerçeve ağsız, opaque origin ve yalnız `allow-scripts` kalır.
- Web image, salt okunur bağlamalar, ağ, loopback port, kaynak sınırları,
  `CapDrop=ALL`, `CAP_CHOWN`, `CAP_SETGID`, `CAP_SETUID` ve
  `no-new-privileges` önceki web ile aynı kalmalıdır.

## Yayın öncesi kapılar

1. Aktif CLAIM/dal/HEAD ve kirli dosyaların kapsamı doğrulanır; kullanıcı
   dosyaları veya özel öğretmen sunumları commit edilmez.
2. `npm run build` v77 paketini üretir. Gerçek v76 tabanı `811d089044df8fe4fcad2698bd0532047f2acc31`
   commit'inden yeniden hazırlanır; yereldeki eski aday dizini üzerine yazılmaz.
3. Notebook, raster, eski sunum, hesap/çevrimdışı ve tarihsel testler çalıştırılır.
   `verify-pptx-notebook-compat.cjs` yeni kayıt ve JSON yedeğini gerçek v76
   okuyucuyla sınar. Fiziksel iPad/Pencil/avuç/bellek kabulü ayrıca kalır.
4. `python -B work/test_deploy_v77.py` paket/CSP/kimlik/yedek/rollback negatif
   testlerini çalıştırır; Docker veya canlı veriye bağlanmaz.
5. Tüm incelenmiş uygulama, test, sürüm, araç ve belgeler commit edilir. PR'ın
   aynı kaynak commit'ine bağlı CI geçmeden canlı aktivasyon yapılmaz.
6. `python -B work/build-release-v77.py`: yalnız committed Git blob'larıyla
   eşleşen dosyaları, deterministik payload ve kaynak receipt'i olarak üretir.
   Eski çıktı üzerine yazılmaz. Çıktı kökü builder'ın raporundan alınır.

Önceki canlı v76'nın pinleri:

- UI `SHA256SUMS`: `e81d8d6236fbda48cdeb02b8d1f216227cab39ab3fa91587e01f263d3b75688a`
- Nginx: `a644b4861b84f5d68e7bf6a294d749c45d33c4d6d0ece584d06beebab231279d`
- Reader-floor (7 Ekim ön kontrolü): `b72108a4d221261e9664c936d1a1c5b3aec1a58b1dc3f95a37ed15877418a5c5`

## Dağıtım — yalnız yetkili ana oturum

Ana oturum gerçek current, eski web, paket özetleri, port ve boş alanı önce
salt okunur doğrular. Yeni v77 kökü daha önce kullanılmışsa üzerine yazılmaz.
Payload, receipt ve bootstrap betiği yüklenir; hash'leri karşılaştırılır.

```sh
sudo python3 -B /opt/bilge-defter-classroom-v77/deploy-v77.py prepare
```

Prepare eski web/static-nginx yedeği, özel Docker yapılandırması ve diğer
servislerin sır içermeyen parmakizlerini alır. **Öğrenci DB'si açılmaz veya
yedekten geri yüklenmez.** `private/` 0700, dosyaları 0600 tutulur. Şu dört
dosya bilgisayarda erişimi sınırlı, Git-dışı bir dizine alınır:

`prior-web.tar.gz`, `web.json`, `protected.json`, `backup-receipt.json`.

Yedekler receipt ile yerelde doğrulandıktan sonra aynı receipt sunucuya
`offhost-backups.json` olarak bırakılır. Özel inspect/env içerikleri loga,
Git'e veya sohbete yazılmaz. Sonra:

```sh
sudo python3 -B /opt/bilge-defter-classroom-v77/deploy-v77.py stage
```

Stage yalnız v77 preview'ını `127.0.0.1:18808` üzerinde açar. Bütün yayın
dosyalarının HTTP gövdeleri, çevrimdışı manifest, frame CSP, anonim/sahte
kimlik reddi ve özel yolların kapalı olması doğrulanır. Diğer servislerin
parmakizleri aynı kalmalıdır. Başarısız stage canlı web'i durdurmaz.

Kaynak/receipt ve tarayıcı kapıları geçtikten sonra:

```sh
sudo python3 -B /opt/bilge-defter-classroom-v77/deploy-v77.py activate
sudo python3 -B /opt/bilge-defter-classroom-v77/deploy-v77.py verify
```

Eski web aynı kimliğiyle `bilge-defter-invited-web-rollback-v77` adıyla korunur.
Yeni web doğrulandıktan sonra current atomik değişir. Başarısızlıkta yalnız
kimliği kanıtlanmış kendi web'i geri alınır; belirsiz kimlikte otomatik işlem
durur. `activation-started.json` sonrasında kör yeniden aktivasyon yapılmaz.
API, worker, kütüphane ve reader-floor tekrar karşılaştırılır.

## Geri dönüş

```sh
sudo python3 -B /opt/bilge-defter-classroom-v77/deploy-v77.py rollback
```

Bu komut yalnız v77 web'i durdurur, korunmuş v76 web'ini aynı ID ile açar ve
current'ı v76'ya çevirir. Adayın sağlam olmasını geri dönüş şartı saymaz;
önceki kaynaklar ve yedek/kimlik zinciri mutlaka doğrulanır. Başka servislerin
sonradan yeniden başlamış olması raporlanır ama onları değiştirme yetkisi vermez.
**`deploy-v75.py rollback` kullanılmaz; v77 işlemi DB veya API geri dönüşü değildir.**

Kullanıcı önce JSON yedeği almalıdır. Sunucunun web'i geri alması cihazdaki
notları silmez; eski sürümün kurulu PWA'ya geçişi açık pencereler kapandıktan
sonra tamamlanabilir. Tarayıcı verileri temizlenmez. Normal sayfa zemini,
çizgiler ve asset depolaması mevcut şemayı kullanır; özgün PPTX JSON yedeğine
dahil değildir. Dosya ayrıca saklanmalıdır.

## Gerçek kullanıcı kabulü

- Davetli HTTPS adresinde giriş, v77 rozeti ve sade Ekle menüsü.
- İzinli PPTX'i açma, sayfaları deftere ekleme, çizme ve JSON yedek alma.
- Uygulamayı kapatıp yeniden açınca notların korunması; iPad kalem/avuç,
  kaydırma, düşük bellek ve arka plandan dönüş.
- Özgün PowerPoint'le görsel karşılaştırma: font/animasyon/video/birebir
  yerleşim desteği vaat edilmez. Tarayıcı testleri gerçek cihaz kabulü değildir.

## 7 Ekim yerel yayın kapıları

- v77 notebook/kayıt/UX: **86/86**, kaynak sapması sıfır.
- Aynı renderer kaynağında sentetik raster güvenliği/görsel kontrolü: **50/50**.
- Gerçek eski v76 okuyucusunda yeni slaytlar, kalem/vurgulama, asset göçü,
  JSON dönüşü ve tekrar v77 açılışı: **14/14**, kaynak sapması sıfır.
  Kanıt: `outputs/pptx-v77-release/notebook-compat/results.json`.
- Yayın araçlarının ağsız testleri: **54/54**; bağımsız inceleme de aynı sonucu
  aldı. Docker kimlikleri ve HTTP cevapları burada kontrollü taklitlerdir.
- Tarihsel regresyon: **26/26 süit** tamamlandı. Gerçek yayımlanmış v76'dan
  v77'ye Service Worker geçişi, bozuk paket ve açık taslak korumaları: **6/6**.
  Kanıt: `outputs/pptx-v77-release/history-v77-windows-20261007.log`.
- Native sunum, hesap yarışı, yedek ve çevrimdışı entegrasyon: **44/44**,
  Chromium + WebKit, sentetik veri, kaynak sapması sıfır.
  Kanıt: `outputs/pptx-v77-release/integration-all-synthetic.json`.
- İlk CI (`37661132835`) tarihsel testleri geçti; eski sunucu dönüşümü
  fixture'ı kapalı "Diğer seçenekler" bölümünü açmadığı için zaman aşımına
  uğradı. Fixture gerçek menü tıklamasıyla düzeltildi; assertions ve timeoutlar
  korunarak yerelde **64/64** geçti. Uygulama baytları değişmedi. İlk paket
  `superseded-bf68f4e` altında saklandı; yeni kaynak commit'i için CI tekrar
  geçmeden aktivasyon yapılmaz.
- Bu sayılar sunucu aktivasyonu, gerçek hesapla giriş veya fiziksel iPad testi
  yapıldığı anlamına gelmez. Canlı bölüm, gerçek kaynak/receipt bağlı sonuç
  oluştuktan sonra eklenir.
