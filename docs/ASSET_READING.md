# Kayıtlı görsellerin sıralı okunması — yerel aday

11 Ekim 2026 · kaynak tabanı `918aa5796110db12cb3950588fb17d521205dbf9`.
CLAIM #102646. Önceki görünüm okuyucusu değişiklikleri korunur; canlı yayın değildir.

## Bu adım

`inflateRecord`, `asset:` referanslarını eskisi gibi tam data URL görsellerine
çevirir. Fark: bütün IndexedDB isteklerini aynı anda başlatmak yerine, benzersiz
görseller tek bir salt-okunur işlemde sırayla okunur. Sonraki `get`, öncekinin
`onsuccess` işleyicisinde bekleme yapılmadan sıraya konur; işlem tek bir tutarlı
görsel görünümünü korur. Görsel başına ayrı işlem açılmaz.

Ham defter nesnesi değiştirilmez. Yeni nesne ve kayıt/çöp toplama eşlemeleri ancak
bütün okumalar ve işlem tamamlandığında, aynı hesap hâlâ geçerliyse yayımlanır.
Eksik görsel, işlem iptali veya hesap kilidi yarım eşleme bırakmaz. Hesap kilidi
bir nesil sayacıyla izlenir; eski bir işlem yeni hesaba uygulanamaz.

Eksik veri veya geçersiz hesap için yeniden okuma yapılmaz. Mevcut bağlantı
kurtarma davranışı, uygun bağlantı hatasında en fazla bir kez kullanılabilir.
Bağlantının kapanma olayı eski bağlantıyı temizlemişse yeniden açılabilir; aynı
hesaba ait olsa bile farklı yeni bir bağlantı eski işin yeniden denemesi için
kapatılmaz veya kullanılmaz. Kopyalanacak görsel hedefleri ilk `await` öncesinde
sabitlenir; çağıranın sonradan değiştirdiği bir referans okuma sonucuna karışmaz.
Görsel içeriğini doğrulama ve eksik kayıtta açılan kurtarma ekranı korunur.

## Değişmeyenler ve dürüst sınır

- Açılan defterin ve çöp kutusunun **bütün encoded görselleri yine RAM'dedir**.
  `assetRefs` eşlemesi de bu dizeleri tutar. Bu çalışma tam lazy loading değildir.
- Tek bekleyen IDB okuması, toplam tarayıcı RAM'ine veya açılış hızına ilişkin
  garanti vermez. Tarayıcının dahili öngetirme/kopyalama davranışı ölçülmemiştir.
- Disk şeması, görsel göçü, kayıt işçisi, JSON yedek ve eşitleme biçimi değişmez.
- Sayfa/dosya/görsel limitleri, çözünürlük, PNG/JPEG kalitesi değişmez.
- Mevcut 100 sayfalık içe aktarma sınırı, birleşik defterin okuma sınırı değildir.
- Eski doğrulayıcıların kabul ettiği padding'siz base64 reddedilmez.

## Tam ihtiyaç-anı yükleme için kalan bağımlılıklar

Mevcut varlık satırı yalnız `{data,t}` içerir. Gövdeyi okumadan boyut ve geometri
bilinmez. Sadece `state` içinde referans bırakmak şu yolları bozar:

1. PDF ve medya doğrulayıcıları data URL ve görsel başlığı bekler.
2. 96 MiB defter ve 5 MiB eşitleme ön kontrolü görsel uzunluklarına dayanır.
3. JSON yedek, yükleme öncesi kopya ve notlu PDF bağımsız tam görsel ister.
4. Eşitleme makbuzu/hash karşılaştırması tam inline JSON'a bağlıdır.
5. `assetRefs` tüm gövdeleri tutmaya devam ederse yeni okuyucu RAM kazancı sağlamaz.

Tam ihtiyaç-anı yükleme kapsamı bu sözleşmeleri birlikte ele almalıdır.
Ara adım olan sahiplik korumalı PPTX hazırlama deposu artık uygulamanın atomik
deftere ekleme yoluna bağlıdır; bkz. `PPTX_STAGING.md` ve `IMPORT_RECOVERY.md`.
Ayrı staging DB'sindeki `commit`, defterin `app-writer` karşılaştırmalı kaydı
yerine geçmez. Belirsiz kayıt sonucunda otomatik tekrar ekleme yapılmaz;
yeniden açılana kadar yazma ve eşitleme karantinası uygulanır. Bu entegrasyon
kalıcı defterin bütün encoded görsellerini RAM'de açma sınırını kaldırmaz.

## Doğrulama

`npm run test:asset-reading -- --out=outputs/asset-reading-20261011/UNIQUE`
gerçek uygulamayı sentetik hesap ve geçici tarayıcı depolamasında sınar. Çıktı
klasörü doluysa durur; eski kanıtın üzerine yazılmaz. Güncel sonuçlar ayrı
`outputs/asset-reading-20261011/REPORT.md` dosyasında kaydedilir.

Yerel testler fiziksel iPad kabulü, tam CI veya yayın onayı sayılmaz.
