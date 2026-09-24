# V52 kaynak teslimi

## Karar ve sahiplik

Tek kaynak mevcut `work/bilge-defter-test` ve `ui-v2/ui-v2-bridge.js`.
`ui-v2` dalı b5ef364, v45 dönemindeki ilk kabuktur. Eski bridge.js/install.js
üretime taşınmaz; dal silinmez. Güncel köprü sayfa kimliği, mevcut defter
şeması, kayıt durumu, medya/PDF ve kurtarma akışlarını kullanır. Yarar sağlayan
eski değişiklikler ancak ayrı regresyonla tek tek alınır; otomatik merge yok.

Kaydı oluşturan Codex'tir. Yerel dal `delivery/v52-source-baseline`.
Kontrol noktası `e09142baf6bf83c1ffdf260e731f4ee8d284800e`; 325 dosya
kayda alındı. Stage yol kontrolü ve kimlik bilgisi örüntü taraması temizdi;
bu tarama tüm olası sırları matematiksel olarak dışlayan bir garanti değildir.

## Önce yedek, sonra commit, sonra test

Değişiklik öncesi `D:/Projelerim/_backups/bilge-defter-20260924-delivery`:

- repository.bundle: `e125e8bdfd332f98a9d855fc69e44a026c43f56e8d92bf7a2f733b75232e1343`
- working-tree.tar.gz: `628158a27dbe2ae32171d339feb06e403ad51f8e3b356455678a05093c85bbd4`

Bundle doğrulandı; çalışma arşivi okunabildi. Arşiv yeniden kurulabilir
ortam/cache klasörlerini içermez. Diğer mevcut dosyaları, yerel yapılandırma
dahil korur; klasör yalnız mevcut Windows hesabı ve SYSTEM erişimine açıktır.
Bu özel yedek Git'e/publik alana yüklenmez. Kaynak veya veri silinmedi.

## Tekrarlanabilir paket

V52 beklenen SHA256SUMS hash'i:
`ac4216857e0fa5a04c31e6d10394c28d68cb87e594b40870a6fbb67582b956f9`.

Hash'lenmiş uygulama dosyalarında Git satır sonu dönüştürmesi kapalıdır.
PDF.js vendor dosyaları/lisansları ve kullanıcı logoları kaynakla kaydedilir.
Test için v51'in yalnız değişen dosyaları `fixtures/v51-delta` içindedir;
kalan dosyalar v52'den alınır ve tarihsel 235 dosya hash'iyle doğrulanır.
Bu gerçek eski sürümün yeniden kurulmasıdır; sürüm adını değiştirerek
eski sürüm gibi gösterilen sentetik uygulama değildir.

README'deki temiz kurulum komutları kanonik test yoludur. Test sonuçları
ignored `outputs/v52` altında üretilir. Önceki yerel ortam üretimden farklı
FastAPI/uvicorn/pywebpush sürümleri içeriyordu; temiz test doğrudan üretim
requirements sürümlerini ve ayrı test kilidini kullanır. OS/Python farkı
ayrıca raporlanır; Windows sonucu Linux konteyner sonucu sayılmaz.

## Sunucu sınırı

Bağımsız hesap servisinin kaynak sahibi bu depo, klasörü `server-candidate/v49`.
Ortak `Codex-server` yalnız tarihsel başlangıç kaynağıdır; yeni hesap servisini
monolite taşımak bu teslimin hedefi değildir. Canlı v50 API kaynak eşliği,
DB/veri mount ve geri dönüş durumu canlı yayından ayrı doğrulanmalıdır.

Canlı v52 yayını önceki raporda kayıtlıdır. Bu teslim çalışması canlı kod,
DB, izin listesi, DNS, tünel veya başka servis değiştirmez. Push/master merge
yapılmaz. Sınıf/gerçek OCR kabulü için `ACCEPTANCE.md` geçerlidir.

## Temiz kopya sonucu

Henüz bu belgeye sonuç işlenmedi. Başarılı komut ve hash kanıtı olmadan
tamamlandı sayılmaz; teslim sonunda bu bölüm ölçülen sonuçla güncellenir.
