# v79 — Numaralı belge gezinmesi ve alt çubuk yakınlaştırması

Bu belge prosedürdür, yayın veya fiziksel iPad kabulü kanıtı değildir. Eski
sürümün başarılı sonuçları v79'a taşınmaz. Son adayın test, CI, stage ve canlı
kanıtları aynı kaynak commit'i, UI manifest'i ve source receipt ile eşleşmelidir.

## Dar kapsam

- PDF/PPTX sayfaları için numaralı açılır panel. Seçim paneli kapatır,
  yakınlaştırmayı korur, sayfa başına gider; sürekli akışın son sayfasında
  konum görünüm sınırına sıkıştırılabilir. Panel tuval boyutunu değiştirmez.
- İki parmak kaydırır; yakınlaştırma mevcut alt çubuğun eksi/yüzde/artı
  düğmelerindedir. Pointer ve eşlik eden touch olayları, iptal, kaleme dönüş
  ve not korunması ayrı test edilir.
- Yeni statik modül page-navigation.js için nginx'in tek izinli farkı:
  mevcut 404 fallback'inin hemen önüne
  "location = /page-navigation.js { try_files $uri =404; }" eklenmesi.
- Eski nginx'in diğer baytları, renderer CSP/hash'i, API yönlendirmeleri,
  kimlik doğrulama ve hız sınırları korunur; genel dizin izni açılmaz.
- Yalnız bilge-defter-invited-web ve atomik current hedefi değişir.
  Yeni kök /opt/bilge-defter-classroom-v79; rollback korunmuş **v78 web**.
  API, kütüphane, worker, Cloudflare, Tailscale ve DB'ler değişmez.
- Web image, iki salt okunur bind, ağ, loopback port, kaynak sınırları,
  CapDrop=ALL, tam CAP_CHOWN/CAP_SETGID/CAP_SETUID ve no-new-privileges korunur.
- Global minimum-reader.json release v75 / minimum_reader v74 kalır.
  Araç yazmaz, hazırlıkta kaydedilen bayt hash'ini doğrular. Bu yayının
  otomatik geri dönüş hedefi daha dar olarak yalnız v78'dir.

## Gerçek önceki v78 yayınının pinleri

| Pin | Değer |
| --- | --- |
| Kaynak | ee44150a3fdb3e500d573756cb29adae73cd152e |
| Kök | /opt/bilge-defter-classroom-v78 |
| UI SHA256SUMS | 915df1b7afdc14f91ba3937a591ab764def3a0ce1118691dd4fb78fb0f9d2862 |
| Nginx | 7051abd3685f6bbe1d15bceca043e80725149e87b8407f46552dc5a0deededad |
| Renderer HTML | 97579fbec1a3c9b4f475ea739cf08418e554bbb508b71ab7ca63696e5562d18f |
| Web image | sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236 |
| Reader-floor tarihsel hash | b72108a4d221261e9664c936d1a1c5b3aec1a58b1dc3f95a37ed15877418a5c5 |

Canlı current, hash'ler, kimlikler ve floor yeniden ölçülür. Builder eski nginx'i
bu immutable Git commit'indeki şablon ve renderer provenance'dan kurar.
tools/prepare-compat-v78.cjs aynı commit'ten gerçek v78 paketini
outputs/pptx-v79-release/v78-baseline/package altında üretir.
Farklı baseline veya mevcut payload üstüne yazılmaz.

## Kaynak ve CI kapıları

1. Aktif CLAIM, dal/HEAD, kullanıcı onayı ve dirty kapsamı doğrulanır.
   Yetkili ana oturum tek yürütücüdür; eşzamanlı deploy yapılmaz.
2. Uygulama, SW/release/offline manifest ve package sürümü v79 olur.
   build-invited yeni dosyayı UI/offline pakete alır; index modülü doğru sırada yükler.
3. verify-page-navigation.cjs ve verify-footer-zoom.cjs son v79 paketinde
   iki motorda geçer. Düz sayfa, PDF, PPTX, kilit, diyaloğa geçiş,
   dokunma hedefleri, seçim ve not korunması kontrol edilir.
4. verify-v79.cjs tarihsel **26 süiti** korur ve gerçek v78 baseline kullanır.
   verify-v79-check.cjs entegrasyon ve gerçek v78 okuyucu sözleşmesini
   açık korumalı uyarlamalarla çalıştırır. Eski v77 okuyucunun 14 kontrolü
   ayrıca korunur; v78 okuyucu kabulünün yerine sayılmaz.
5. Slayt akışı ve medya/geri alma kalite kontrolleri DPR1/DPR2'de tekrarlanır.
   Zorunlu Linux/WebKit hatası Windows veya eski yeşil raporla kapatılamaz.
   Eşlenik negatif kontrolün immutable tabanı, runner hash'i ve 54 raster
   denetimi korunur. Yeni sürüm meta verisi ve navigation modülü için
   yalnız açık dosya-farkı sözleşmesi genişletilir; eşikler gevşetilmez.
6. python -B work/test_deploy_v79.py eski 56 güvenlik/rollback kontrolünü
   ve altı yeni exact-route/eksik modül negatif kontrolünü çalıştırır.
   Bunlar sentetik geçici veri ve mock Docker/HTTP kullanır; canlıya gitmez.
7. package/CI aday yolları v79 olmalı: BILGE_TEST_ROOT, SW/cache sürümleri,
   integration/compat adapter, baseline ve history wrapper ayrı kontrol edilir.
8. Kod, test, sürüm, araç ve belgeler commit edilir; aynı SHA'nın gerçek
   zorunlu CI'ı tamamlanır. Kaynak değişirse ilgili kanıtlar yeniden üretilir.

## Paketleme ve statik yedek

python -B work/build-release-v79.py yalnız committed Git blob'larıyla eşleşen
UI'dan deterministik payload üretir. Çıktı outputs/direct-pptx-release-v79/package
altında payload.tar.gz ve source-receipt.json'dur. Payload yalnız UI/nginx ve
iki yayın betiğidir; API/DB/not içeremez. Aktarım sonrası hash'ler karşılaştırılır.
Kullanılmış canonical release kökü kör biçimde yeniden kullanılmaz.

Yetkili ana oturum:
sudo python3 -B /opt/bilge-defter-classroom-v79/deploy-v79.py prepare

Prepare eski statik UI/nginx ve floor'u prior-web.tar.gz içinde korur;
web sözleşmesi ve diğer servis parmakizlerini özel dosyalara yazar.
private/ 0700, dosyalar 0600'dür. **DB açılmaz veya kopyalanmaz.**
prior-web.tar.gz, web.json, protected.json ve backup-receipt.json erişimi
kısıtlı, Git-dışı off-host dizine alınır. Gerçek hash ve yerel izinler doğrulanınca
aynı receipt offhost-backups.json olarak sunucuya bırakılır. Inspect/env sırları
sohbete yazılmaz. Yanlış kaynak/receipt veya eksik yedek stage'i durdurur.

## Stage ve tarayıcı kabulü

sudo python3 -B /opt/bilge-defter-classroom-v79/deploy-v79.py stage

Preview yalnız 127.0.0.1:18810'da açılır. HTTP dosya hash'leri, offline dosyalar,
frame CSP, 16 anonim/sahte kimlik reddi ve özel yolların 404 olması ölçülür.
Yeni navigation modülü zorunludur. Üretim web'i durdurulmaz; ilgisiz servis
ve floor parmakizleri aynı kalır.

Özel SSH forward hazır olduğunda BILGE_STAGE_ORIGIN=http://127.0.0.1:18820 ile
node work/verify-stage-v79.cjs çalıştırılır. Yerel18820 remote18810'a gider.
Gerçek nginx yanıtları hash/CSP denetiminden sonra değiştirilmeden tarayıcıya
iletilir. Sadece GET whoami sentetik onaylı hesapla yerelde cevaplanır;
diğer servis yolları, yazma istekleri ve dış ağ kapalıdır. SW dahil değildir.

İki motor gerçek Ekle menüsüyle iki sentetik PPTX slaytı ekler, kalem kaydını
kapat/aç ile denetler, gerçek numaralı düğmelere ve footer zoom'a dokunur.
PDF gezinmesi üretilmiş PNG arka planlı PDF-sayfa fixture'ında sınanır;
PDF ayrıştırması veya gerçek öğretmen dosyası kabulü değildir.
Rapor: outputs/direct-pptx-release-v79/stage-browser.

## Aktivasyon ve geri dönüş

**Operatör kapısı:** source/receipt bağlı stage, aynı son manifest'li tarayıcı
sonucu ve aynı commit'in bütün zorunlu CI sonuçları ana oturumca eşleştirilir.
Deploy betiği stage/yedek kanıtlarını doğrular; GitHub CI veya yerel browser
raporunu otomatik okumaz. Bu ayrı kontrol atlanamaz.

sudo python3 -B /opt/bilge-defter-classroom-v79/deploy-v79.py activate
sudo python3 -B /opt/bilge-defter-classroom-v79/deploy-v79.py verify

Eski v78 aynı ID ile bilge-defter-invited-web-rollback-v79 adıyla saklanır.
Yeni web loopback18790'da doğrulanır; current atomik değişir.
activation-started.json sonrasında kör tekrar aktivasyon yapılmaz.

sudo python3 -B /opt/bilge-defter-classroom-v79/deploy-v79.py rollback

Aday UI/doğrulayıcı bozulsa da geri alma çalışır: sağlam v78 dosyaları,
receipt, yedek, floor ve tam kimlikle eski web yeniden açılır. İlgisiz servis
yeniden başlaması raporlanır; kendi web'ini kurtarmaya veto olmaz. Bilinmeyen
ID durdurulmaz. **Eski v78 deploy betiğinin rollback komutu kullanılmaz;
hiçbir DB restore edilmez.** Geri dönüş notların eski kopyaya çevrilmesi değildir.

v78 yeni numaralı paneli ve footer/dokunma değişikliğini içermez. JSON yedek
bağımsız korunur; reader-floor v75/min74 değişmez.

## Kanıt ve kabul sınırı

Bu araçları hazırlayan alt oturum test/build/CI/stage/yayın çalıştırmadı.
Gerçek sonuçlar, başarısız veya atlanmış kontroller dahil, yetkili ana oturum
tarafından rapor/commit/receipt ile ayrıca kaydedilir. Bu belge tek başına
tamamlanmış yayın göstermez.

Gerçek iPad'de PDF/PPTX seçimi, uzun belgede kaydırma, kalem/avuç içi,
yakınlaştırma, uzun kullanım ve JSON yedekten dönüş ayrı kullanıcı kabulüdür.
Tarayıcı otomasyonu, hash veya HTTP200 bu cihaz kabulünün yerine geçmez.
