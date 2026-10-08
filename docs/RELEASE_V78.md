# v78 — Sunum sayfaları ve çizim arayüzü

Bu belge yayın prosedürü ve kontrol listesidir; canlıya alınmış olma veya
fiziksel iPad kabulü kanıtı değildir. Canlı sonuç, aynı kaynak commit'i ve
receipt'e bağlı `live-proof.json` ile ayrıca doğrulanır.

## Kapsam

- Deftere eklenmiş PowerPoint sayfalarında aşağı doğru sürekli kaydırma,
  genişliğe sığan görünüm, ana defter kalem araçları ve gereksiz PDF çubuğunun
  kaldırılması. Normal PDF ve düz sayfa akışları ayrı regresyon kapılarıdır.
- Görünür çizimler için sınırlı karo önbelleği. Sıcak ve soğuk çizim ölçümleri
  ayrı değerlendirilir; masaüstü WebKit sonucu fiziksel iPad performansı değildir.
- Yeni fosforlu çizgilerde `markerOpacity=0.4`; bu alanı olmayan eski çizgiler
  `0.25` kalır. Var olan notlara toplu göç veya yeniden boyama yapılmaz.
- 39 yerel Tabler simgesi ve mevcut logonun çerçeve rengine uyan CSS maskesi.
  PNG kaynakları ve yüklenmiş uygulamanın PWA simgesi değiştirilmez.
- Yalnız `bilge-defter-invited-web` ve `current` değişir. Yeni kök
  `/opt/bilge-defter-classroom-v78`, geri dönüş hedefi korunmuş **v77** web'dir.
- Accounts API, kütüphane, sunucu dönüştürücüsü, PPTX renderer, kimlik doğrulama,
  Cloudflare/Tailscale ve sunucu veritabanları değişmez. Öğrenci dosyaları veya
  notlar yayın paketine/yayın kanıtına alınmaz.
- Nginx yapılandırması CSP dahil **bayt bayt v77 ile aynı** kalır. Eski
  `v76 direct-pptx exact routes` yorumları bilinçli korunur; yeni genel dizin
  izni açılmaz. Renderer ağsız, opaque origin ve yalnız `allow-scripts` kalır.
- Web image, iki salt okunur bağlama, ağ, loopback port, kaynak sınırları,
  `CapDrop=ALL`, tam olarak `CAP_CHOWN`, `CAP_SETGID`, `CAP_SETUID` ve
  `no-new-privileges` önceki web ile aynıdır.
- `minimum-reader.json` release v75 / minimum okuyucu v74 olarak korunur.

## Önceki canlı v77'nin sabit tabanı

- Kaynak: `a441a2d3e1cb2fce7afcd592f7ca5d1480fe9e05`
- UI `SHA256SUMS`: `faf16c238f8e390c1a87ce4358b3e1eca517fcf7db01614c5e439d8aa73de25e`
- Nginx: `7051abd3685f6bbe1d15bceca043e80725149e87b8407f46552dc5a0deededad`
- Renderer HTML: `97579fbec1a3c9b4f475ea739cf08418e554bbb508b71ab7ca63696e5562d18f`
- Reader-floor (ana oturum ön kontrolü): `b72108a4d221261e9664c936d1a1c5b3aec1a58b1dc3f95a37ed15877418a5c5`

Builder, v77 nginx'i bu Git commit'indeki şablon ve renderer provenance
dosyalarından yeniden kurar. Kirli çalışma kopyasından veya eski bir yerel
aday dizininden taban almaz. Yeni renderer hash'i/CSP veya nginx farkı yayını
durdurur; bu farkı kabul etmek v78 kapsamına dahil değildir.

## Yayın öncesi kapılar

1. Aktif CLAIM, doğru dal/HEAD ve dirty kapsamı doğrulanır. Kullanıcıya ait
   dosyalar korunur; özel PPTX dosyaları, inspect/env ve yedekler Git'e girmez.
2. Uygulama sürümü v78 olarak oluşturulur. Gerçek v77 uyumluluk tabanı yukarıdaki
   commit'ten hazırlanır; eski aday çıktı dizininin üstüne yazılmaz.
3. Sürekli kaydırma, kalem/silgi/medya/geri alma, sıcak-soğuk çizim, DPR1/DPR2,
   marker ve logo kontrolleri son aday baytlarında çalışır. Açık bir görsel
   kalite kapısı varsa eski yeşil raporla kapatılmış sayılmaz.
4. Normal PDF/düz sayfa, PPTX ekleme, JSON yedek/yeniden açma, hesap kilidi,
   çevrimdışı paket ve tarihsel regresyonlar geçer. Yeni kayıt gerçek v77
   okuyucuyla açılır. Bu kontrol rollback sonrası birebir aynı görünüm vaadi
   değildir: v77 yeni marker opaklığını kullanmadığından daha soluk gösterebilir.
5. `python -B work/test_deploy_v78.py` paket, nginx/CSP, kimlik, off-host yedek,
   bozuk aday ve geri alma negatif testlerini çalıştırır. Bu testler sentetik
   geçici veriler kullanır; Docker veya canlı hesaplara bağlanmaz.
6. İncelenmiş uygulama, test, sürüm, araç ve belgeler commit edilir. PR ve aynı
   kaynak commit'ine bağlı gerçek CI başarıyla tamamlanmadan aktivasyon yapılmaz.
7. `python -B work/build-release-v78.py` yalnız committed Git blob'larıyla
   eşleşen UI dosyalarını deterministik payload ve kaynak receipt'i olarak
   üretir. Çıktı: `outputs/direct-pptx-release-v78/package`. Eski payload veya
   receipt üzerine yazılmaz; paket hash'leri aktarım sonrasında karşılaştırılır.

## Dağıtım — yalnız yetkili ana oturum

Önce gerçek current, eski web ID'si, taban hash'leri, önizleme portunun boşluğu
ve yeterli alan salt okunur doğrulanır. Kullanılmış v78 kökü üzerine kör yazılmaz.
Payload, receipt ve receipt'e bağlı bootstrap betiği aktarılır; hash'leri doğrulanır.

```sh
sudo python3 -B /opt/bilge-defter-classroom-v78/deploy-v78.py prepare
```

Prepare önceki statik UI/nginx yedeğini ve özel Docker yapılandırmasını alır.
`private/` 0700, dosyaları 0600'dür. Öğrenci DB'si açılmaz/kopyalanmaz. Şu dört
dosya ayrıca erişimi kısıtlı, Git-dışı bir bilgisayar dizinine alınır:

`prior-web.tar.gz`, `web.json`, `protected.json`, `backup-receipt.json`.

Dosya hash'leri ve yerel erişim izinleri kontrol edildikten sonra doğrulanmış
receipt sunucuya `offhost-backups.json` olarak bırakılır. Inspect/env içerikleri
sohbete veya genel loga basılmaz. Bu yedek kapısı geçmeden stage başlamaz.

```sh
sudo python3 -B /opt/bilge-defter-classroom-v78/deploy-v78.py stage
```

Stage yalnız `127.0.0.1:18809` üzerinde v78 önizlemesini açar. Tüm yayın
dosyalarının HTTP gövdeleri, offline manifest, frame CSP, anonim/sahte kimlik
reddi ve özel yolların 404 olması ölçülür. Diğer servislerin parmakizleri aynı
kalmalıdır. Stage hatası canlı web'i durdurmaz. Tarayıcı kontrolleri gerçek
öğrenci hesabı/notu kullanmaz; sentetik hesap sınırı ayrıca doğrulanır.

Kaynak/receipt, stage, tarayıcı ve aynı commit CI kapıları geçtikten sonra:

```sh
sudo python3 -B /opt/bilge-defter-classroom-v78/deploy-v78.py activate
sudo python3 -B /opt/bilge-defter-classroom-v78/deploy-v78.py verify
```

Eski web aynı ID ile `bilge-defter-invited-web-rollback-v78` olarak durdurulmuş
halde saklanır. Yeni web loopback `18790` üzerinde doğrulandıktan sonra current
atomik değiştirilir. Hata halinde yalnız kimliği kanıtlanmış kendi web'i geri
alınır. `activation-started.json` sonrasında kör tekrar aktivasyon yapılmaz.

## Geri dönüş

```sh
sudo python3 -B /opt/bilge-defter-classroom-v78/deploy-v78.py rollback
```

Bu komut yalnız v78 web'i durdurur; hazırlanırken kaydı/yedeği alınan v77 web'i
aynı ID ile yeniden açar ve current'ı v77'ye çevirir. **v77'nin eski deploy
betiğinin rollback komutu kullanılmaz**: o başka bir eski sürüme aittir.

Aday UI veya aday doğrulayıcı bozulsa da geri dönüş engellenmez. İlgisiz bir
servisin yeniden başlaması raporlanır; yalnız kendi web'ini kurtarmaya engel
sayılmaz. Fakat güvenilir deploy betiği, kaynak receipt'i, özel yedek zinciri,
sağlam v77 dosyaları, reader-floor ve tam container kimlikleri zorunludur.
Bilinmeyen veya kayıp hedefte otomatik durdurma/yeniden adlandırma yapılmaz.

Hiçbir DB geri yüklenmez, notlar eski yedekle değiştirilmez. Geri dönüş sadece
web kodunundur. Eski arayüz sürekli sunum kaydırmasını ve yeni logo/marker
görünümünü sunmayabilir; JSON yedek ayrıca korunmalıdır.

## Kanıt durumu ve kabul sınırı

### Tarihsel erken kayıt — 8 Ekim 2026

Bu sonuçlar `work/bilge-defter-invited-v78` erken paketinin `SHA256SUMS`
hash'ine bağlıdır: `366143d241b3baaabce8701f535366bf1ab6eddf6b41c2bf629a88feffc2f0ea`.
Bu hash bir kaynak commit'i veya son yayın receipt'i değildir. Retina
düzeltmesinden sonra oluşacak son pakete bu sonuçlar kendiliğinden taşınmaz.

- `node work/verify-v78.cjs` ilk koşuda **21/26 paketi geçti**, ardından
  `verify-v51-login.cjs:31` eski logo öğesini doğrudan `IMG` sandığından durdu
  (`undefined` / `true`). Yeni CSS-mask kapsayıcısı `SPAN` olduğu için bu bir
  test yapısı uyumsuzluğuydu; ilk koşu tam başarı diye kaydedilmedi.
  Yerel log: `outputs/v78/historical-early-366143d2.log`, SHA256
  `466d22e8309df058ae977ffae745b44658155bbb3a4d2d8189df5e5783194b93`.
- Eski v51 testi değiştirilmedi. Yalnız yeni `verify-v78.cjs` adaptöründeki
  tam-eşleşme korumalı dönüşüm, görünür maskeyi ve gerçek yedek `IMG` öğesini
  ayrı doğruladı. PNG boyut/hash, Apple simgesi ve kimlik doğrulama kontrolleri
  korunarak kalan paketler geçti: login **14**, library quote **28**,
  terminology UI **40**, dictionary search **12**, güncelleme **6**.
  Böylece aynı sabit uygulama baytları üzerinde **26/26 paket parçalı koşularla
  tamamlandı**; tek seferde yeşil bir 26-paket koşusu olarak sunulmaz.
- Ayrı hedefli kontroller **91/91**: marker **18**, tema/logo **15**, gerçek
  v77 okuyucuyla defter uyumluluğu **14**, PPTX entegrasyonu **44**. Bu raporlar
  da aynı erken paketi kullanır; uygulama kaynak farkı `[]` olarak bildirildi.
- Yayın/geri alma araçlarının yerel sentetik testleri **56/56 geçti**.
- Ana oturumun `python -m pytest server-candidate/v49/tests worker -q`
  sonucu: **338 geçti, 25 atlandı**. Atlananlar gerçek worker ortamı gerektirir;
  geçilmiş veya canlı dönüştürücü kabulü sayılmaz. Bu yayın backend/worker
  değiştirmez.

### Ara aday ve son hedefli düzeltme

- Ara üretilen paket `760e1745566c1738cca2f7336b7d321578f5849271ea98fcf3b59da9214e3f94`
  üzerinde aynı dört hedefli grup **91/91** geçti. Bu paket son held-pen
  düzeltmesinden öncedir; nihai yayın paketi olarak etiketlenmez.
  `outputs/v78/historical-final-760e1745.log` koşusu **26/26 tek koşuda geçti**
  (exit 0); log SHA256:
  `f51099bf22a42b868695f98979b110297970b24cf9d352539e973b85a8cbd54f`.
  Bu sonuç da held-pen düzeltmesi öncesi ara baytlara aittir; dosya adındaki
  `final` son sürüm kanıtı değildir. Son commit'in CI'ı 26 paketi yeniden sınar.
- Eski basınç verisini taşıyan çizimler, yeni kalem basılı tutulduğunda
  görünür kalmalıdır. Mevcut legacy-pressure vakasına held-pen kontrolü eklendi;
  toplam **50 kontrol/DPR** değişmedi. Düzeltme öncesi DPR1 negatif kontrol
  **0/2**, düzeltmeden sonra Chromium ve WebKit'te DPR1 **2/2**, DPR2 **2/2**
  geçti; idle/held karşılaştırmasında RGBA farkı sıfır olarak ölçüldü.
  Üç rapor da kaynak farkı `[]` bildirir. Kanıtlar:
  `outputs/slide-flow/dpr-1-held-pressure-negative/report-accepted-legacy.json`,
  `outputs/slide-flow/dpr-1-held-pressure-fix/report-accepted-legacy.json` ve
  `outputs/slide-flow/dpr-2-held-pressure-fix/report-accepted-legacy.json`.
- Hedefli düzeltme kaynağı `pdf-workspace.js` SHA256:
  `b0737f159b188faa810594ed1f9372615e9a07d16d36a49cd23f1fe1a5cbf7ab`.
  Test runner SHA256: `c13e84cc6b93f21d1b8f9ed8e4a367ae37724fc599877c411bfb6db88b84fdf0`.
  Bu dört pozitif hedefli kontrol, tek başına tam **50+50** koşusunun veya aynı
  commit CI'sının yerine geçmez. Son üretilen paket ayrıca aşağıda doğrulandı.

### İlk kaynak adayı (57a6ce72) — yerel 191/191 hedefli kontrol

Son `work/bilge-defter-invited-v78/SHA256SUMS` SHA256:
`a4d32169cc0dd3a8e032960d210093149e0da0d23669ceafe8123566100d668c`.
Paket, yukarıdaki `b0737f...` çizim kaynağını içerir. Kontrollerin başlangıç ve
bitişinde bu paket hash'i aynı kaldı; raporların kaynak farkı listesi `[]`.

- Sürekli slayt akışı **DPR1 50/50**, **DPR2 50/50** geçti. Raporlar gerçek
  üretilen v78 dizinini hedefler; `c13e84...` runner ile iki tarayıcı motorunu,
  sıkı çizim kalite eşiklerini ve genişletilmiş held-pen vakasını içerir.
  `outputs/slide-flow/dpr-1/report.json` SHA256:
  `bff57852d37687058e87317d42ab49c2227094dd6b96d53fc603f34b78172693`.
  `outputs/slide-flow/dpr-2/report.json` SHA256:
  `5764fb0d889a49f53ce704e4982d18c2a33dc5043c44546d74c77f29e34b64db`.
- Ayrı **91/91** kontroller aynı son pakette yeniden geçti: marker **18**
  (`outputs/marker-icons/report.json`), tema/logo **15**
  (`outputs/theme-logo/report.json`), gerçek v77 okuyucu uyumluluğu **14**
  (`outputs/pptx-v78-release/notebook-compat/results.json`), PPTX entegrasyonu
  **44** (`outputs/pptx-v78-release/integration-all-synthetic.json`).

Bu bölüm yerel uygulama paketi kabulüdür; başarılı GitHub CI sonucu,
stage veya canlı yayın receipt'i değildir. Önceki başarısız/ara koşular yukarıda
korunur. Son paket için tarihsel 26-paket kapısı aynı kaynak commit'inin gerçek
CI'ında yeniden kapanmalıdır; ara adayın yeşil sonucu bunun yerine kullanılmaz.

### Linux CI engeli ve dar yüzey-boyutu düzeltmesi

`57a6ce72` kaynak commit'i PR #19'a gönderildi. Bu adayın kaynak receipt'i
`95f0681f8397279a051e383ce23b8f71e74596d67980fe09a5c780250d0476ea`, payload'ı
`bf8f68877f767d0869234b82e0b11eeb3deea232727abedcda6ae2c1086b9219` idi.
Klipper önizlemesinde 246 HTTP gövde hash'i, 243 çevrimdışı dosya, 16 kimlik
reddi ve 16 özel-yol reddi geçti. Gerçek nginx üzerinde sentetik hesapla
tarayıcı kontrolü 12/12 geçti; bunlar gerçek öğrenci veya iPad kabulü değildir.
**Bu aday aktive edilmedi; canlı v77 kaldı.**

GitHub koşusu `37734784617`, Linux WebKit/DPR2 medya geri alma kontrolünde
49/50 kaldı: değişmeyen komşu slaytta 13 kalem kenarı pikseli farklıydı
(alfa en çok 64). Tarihsel 26 paket ve DPR1 50/50 geçmişti; sonrasındaki
adımlar atlandığı için bütün CI başarılı sayılmadı. Test-only `6faf334`
commit'inin `37737955194` koşusu aynı hatayı tekrar üretti; içerik SHA'sı
değişmeden önbelleği yenilemek farkı sıfırladı. Eski sıcak sonuç başarısız
kalmaya devam etti. Eşikler gevşetilmedi.

Dar düzeltme yalnız çizim önbelleğinin kimliğine ana tuvalin fiziksel genişlik
ve yüksekliğini ekler. Medya paneli/yeniden boyutlandırma sonrası eski yüzey
pikselleri kullanılamaz; aynı boyutta kaydırma ve sıcak çizim yeniden kullanılır.
Kaynak `pdf-workspace.js` SHA256:
`64ce1a24e4fb7c3997d693718721ff9d08300ca68bf77f6d75d43ff5953f2eb9`.
Yeni sentetik bitmap testi önce iki motorda 0/2 kaldı, düzeltmeden sonra
DPR1/DPR2 toplam 4/4 geçti; eski medya/geri alma hedefi de 4/4 geçti.
Tam slayt süiti artık 52 kontrol/DPR içerir. Ayrıntı ve ölçüm sınırları
[SLIDE_FLOW.md](SLIDE_FLOW.md) dosyasındadır. Bu yerel sonuç yeni kaynak
commit'inin Linux CI kapısını kapatmaz.

İlk adayın üzerine yazılmaz. Tam kaynak/receipt/preview kimliği ve canlı
v77/current/floor değişmezliği doğrulandıktan sonra yalnız geçici preview
durdurulup kaldırılabilir; aday dosyaları ve özel yedekleri aynı diskteki
0700 arşive korunarak taşınır. Yeni temiz kaynak için yeni immutable payload,
yeni `prepare`, yeni off-host yedek ve yeni stage/tarayıcı kanıtı gerekir.
Eski stage receipt'i yeni adaya aktarılamaz. Arşivdeki eski deploy betiği
çalıştırılmaz; onun ROOT yolu canonical v78 olarak sabittir. Bu operasyon
canlı v77'yi veya başka servisi durdurmaz.

### Henüz kapanmamış kapılar

Linux koşuları `37738959813` (`94d81ec`) ve `37740558999` (`bab29c4`)
aynı özgün medya geri alma kontrolünde **51/52** kaldı. Boyut anahtarı
düzeltmesi tek başına yeterli değildir. Son izde 872 kayıt, 0 taşma;
etkilenen üç çizginin dönüşüm/clip/çizim durumu ve parça kopya koordinatları
referans ve soğuk tekrar ile aynıydı. Raster farkının kesin nedeni henüz
kanıtlanmadı; hata #2300 açıktır, PR #19 birleşmedi, canlı v77 korunmuştur.
Yeni kontrollü test sonuçları özgün başarısızlığı veya kabul eşiklerini
değiştiremez. Yereldeki `94d81ec` payload'ı son aday sayılmaz; nihai temiz
kaynak commit'i için yeniden paket ve ayrı yayın kanıtları gerekir.

- Yerel Retina/DPR2 ve hedefli kontroller son adayda geçti; ancak kaynak
  yeniden değişirse ilgili testler tekrar çalıştırılır. Tek kaynak commit'ine
  bağlı paket/receipt, PR ve gerçek CI sonucu ayrıca gerekir.
- Son aday CI, stage, aktivasyon ve fiziksel iPad kabulü henüz bu belgeyle
  kanıtlanmış değildir; ayrı sonuç/receipt beklenir. Bu yerel test kayıtları
  tek başına canlıya alma, başka servis değiştirme veya öğrenci verisine erişme
  yetkisi vermez; yetkili ana oturum yukarıdaki yayın kapılarını uygular.
- Gerçek iPad/Pencil, avuç içi, yoğun defter belleği ve uzun süreli kullanım
  yayın sonrası kullanıcı testi olarak ayrı raporlanır.
- İlgili tasarım/sınırlar: [SLIDE_FLOW.md](SLIDE_FLOW.md),
  [MARKER_ICONS.md](MARKER_ICONS.md), [THEME_LOGO.md](THEME_LOGO.md).
