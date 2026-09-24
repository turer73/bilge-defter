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

2026-09-24: e09142b kontrol noktasından sonra d25b716 test altyapısı ve
f91ed0c PDF bayt koruma düzeltmesi temiz klona aktarıldı.
Test kökü: D:/Projelerim/bilge-defter-v52-clean.

- npm ci ve Playwright Chromium kurulumu başarılı.
- Kilitli Python ortamı: Windows, Python 3.14; Linux üretim Python 3.12 değildir.
- npm test: 192 kontrol başarılı (72 backend, 31 tablet boyutu, 29 güvenlik,
  13 hesap, 8 izin listesi, 10 tema, 6 güncelleme, 14 giriş, 9 kalem regresyonu).
- OCR ölçüm aracı: 8 birim testi; sınıf geçiş/yedek yardımcıları: 3 test başarılı.
- Toplam 203 kontrol; gerçek el yazısı model ölçümü ve fiziksel cihaz testi yok.
- 232 çevrimdışı varlık ve 18 script denetlendi. Temiz v52 paket hash'i yukarıdaki
  canlı hash ile birebir aynı; gerçek v51 eski paket hash'leri de doğrulandı.
- Chromium sentetik 4x CPU yavaşlatmada 120 kalem hareketi: araç yenileme sayısı
  120 -> 1; ölçülen süre 76.2 -> 0.8 ms; 121 nokta/revizyon korundu.
  Bu sayılar gerçek iPad gecikmesi veya kullanıcı hissi ölçümü değildir.
- Üretilen 1180px üst araç, 390px giriş ve tema paneli ekranları görsel incelendi;
  incelenen görüntülerde yatay taşma veya ayarlar düğmesi kesilmesi görülmedi.

İlk temiz üretim başarısızdı: önceden kaydedilmiş PDF dosyasında Git LF dönüşümü
vardı. Mevcut canlı CRLF baytları kayda alınarak düzeltildi; beklenen hash
değiştirilmedi. Yayına girmeyen kaynak README'sinin tek CRLF satırı da korundu.
Playwright kurulumu kullanılmayan chromium-1217 cache'ini otomatik kaldırdı;
gerekirse ilgili Playwright sürümüyle yeniden indirilebilir. Kullanıcı verisi silinmedi.

Canlı salt-okunur doğrulama: web SHA256SUMS eşleşti; hesap konteyneri hâlâ
bilge-defter-accounts:v50, başlangıç 2026-09-23T19:24:15.128690167Z.
Yedi Python kaynak dosyası ve requirements.txt, yerelde CRLF -> LF
normalizasyonuyla canlı hash'leriyle eşleşti. Bu, tüm canlı bağımlılıkların
veya gerçek e-posta girişinin test edildiği anlamına gelmez.

Kanıtlar temiz klonda outputs/v52 altında: audit-results.json,
login-results.json, performance-results.json ve ekran görüntüleri.
Push, master merge, canlı deploy ve kullanıcı listesi değişikliği yapılmadı.
OCR motor karşılaştırması ile A1-A10 gerçek kabul kapıları açık kaldı.
