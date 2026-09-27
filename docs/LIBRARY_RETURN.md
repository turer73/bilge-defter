# Kütüphaneden dönüş ve defter kaydırması — v58 adayı

Kullanıcı iPad'de kütüphaneden deftere dönemediğini, ayrıca not yazılan sayfada
iki parmakla kaydırmanın atladığını/kastığını bildirdi. Bunlar ayrı iki akıştır.

## Hazırlanan değişiklikler

- Kütüphane listesi, PDF sayfa penceresi ve metin okuyucuda **← Deftere dön**.
  Büyük dokunma alanı üstte sabittir; kaydırırken erişilebilir kalır.
- Bağlantı sabit `https://defter.bilgearena.com/` adresine, aynı sekmede gider.
  JavaScript, tarayıcı geçmişi, `window.close()` veya yeni pencere iznine dayanmaz.
  Hesap/alıntı verisini bağlantıya eklemez. Kurulu iPad uygulamasını öne getirdiği
  garanti edilmez; tarayıcıda açılmış kütüphaneden defteri aynı tarayıcı sekmesinde açar.
- İki parmak hareketi her pointer olayı için tam yeniden çizim yapmak yerine
  ekran karesi başına bir kez çizilir. Konum hesabı anlık ve kesin kalır.
- Salt görünüm kaydırmasında araç çubuğu/paper ayarı ve tüm görsel listesi taraması
  atlanır. Kayıt durumunun temizden bekleyene geçişi korunur.
- Kaleme geçiş, kaydırma sonu, pencere odağı kaybı ve açık yeniden çizim bekleyen
  kareyi tamamlar/iptal eder. Eski kare yeni mürekkebin üzerine çizilmez.
- Depolama şeması, CAS koruması ve 5 saniyelik kayıt kontrolü değiştirilmedi.
  Çok büyük defterlerin tam serileştirme maliyeti ve görünür çizgilerin çizim
  maliyeti hâlâ vardır; bütün iPad kasmalarının çözüldüğü iddia edilmez.

## Doğrulama

- Kütüphane: Chromium/WebKit, 390/820/1180 genişlik, üç ekran; aynı sekme hedefi,
  dokunma alanı, kaydırma sonrası erişim ve JavaScript kapalı dönüş: **20 kontrol**.
- İzole kütüphane Python testleri: **44 geçti**; gerçek yer imi verisi kullanılmadı.
- Yeni kaydırma testi eski v57'de beklenen noktada başarısız oldu. v58'de iki
  tarayıcı motorunda **18 kontrol** geçti: 80 olay → 1 çizim, kesin mesafe,
  kaleme dönüş, eski karenin iptali, son konumun CAS ile kaydı.
- Mevcut **32 kalem kontrolü**, tablet/PDF/medya ve alıntı senaryoları tekrar sınandı.
- Gerçek service worker testi: bozuk paketin reddi, açık taslağın korunması,
  çoklu pencere ve v57 → v58 çevrimdışı güncelleme: **6 kontrol** geçti.
- WebKit 820 px PDF ve 390 px metin ekran görüntüleri görsel olarak incelendi.
- Tam tekrar komutu `npm test`; doğru v58 adayına yönlendirilir ve önceki v57'yi
  yayımlanmış `11a9a725bad31f5495b244fba8b709bc02e181ad` commit'inden hash kontrolüyle üretir.

Test yazımında önce ilk parmağın geçici çizgi iptali hareket sayımından ayrıldı;
ardından gerekli tek kayıt-durumu yenilemesine izin verildi. Bunlar test düzeneği
düzeltmeleridir, iptal veya kayıt davranışı uygulamadan kaldırılmadı.

## İlk hazırlık anındaki yayın sınırı

Henüz commit, push veya canlı yayın yapılmadı. Kullanıcı yayın sorusuna yeni
kaydırma sorununu bildirdi; bunu ayrıca yayın onayı saymadık. Canlı son yayın v57.
Özgün kirli PDF çalışma ağacı ve sunucu servisleri değiştirilmedi.

v58 adayının paket hash'i:
`e39aa2e0087a62bb9bf4fa1cb4821efa59f232c7e459d3cc419801868fd21c4b`.
Kütüphane dosyaları ayrı sunulduğundan ana v58 web paketiyle birlikte kontrollü
yayınlanmalıdır; eski v57 deploy aracı sürüm/hash değiştirilmeden kullanılamaz.
Yayın sonrası gerçek iPad'de uzun dolu sayfa, iki parmak kaydırma → kalem ve
kütüphanenin üç ekranından dönüş testi hâlâ gereklidir.

## Sonraki onay ve yayın

Kullanıcının `Alalım` onayından sonra 26 Eylül 2026'da v58 web ve kütüphane
birlikte yayımlandı. Kaynak `be8637d` commit'iyle kaydedildi ve GitHub'a gönderildi.
Canlı sonuç, geri dönüş ve kalan cihaz kabulü: [RELEASE_V58.md](RELEASE_V58.md).

## v59 düzeltmesi — dönüş gerçekten aynı deftere

v58'deki bağlantı doğru adrese gidiyordu ama defter kütüphaneyi yeni sekmede açtığı için
**Deftere dön** açık defter sekmesine değil, yeni bir defter penceresine varıyordu.
Tarayıcıda her gidiş-dönüş bir defter sekmesi daha bırakıyordu. Aynı defterin iki kopyası
kayıt çakışma korumasına takılabiliyor ve tek dokunuşla güncellemeyi bekletiyordu. Kurulu
iPad uygulamasında yeni sekme uygulama dışındaki tarayıcı görünümünde açılabildiğinden,
dönüş başka bir depolama alanını gösterebilirdi.

v59'da defter kütüphaneyi kendi penceresinde açar; önce açık düzenlemeyi denetler ve kaydı
diske yazar. Böylece kütüphanedeki bağlantı değişmeden gerçek bir dönüş olur ve alıntı
aktarımıyla aynı modeli kullanır. Kütüphane açılamazsa servis worker ham hata yerine dönüş
sayfası gösterir. Ayrıntı ve kanıt: [RELEASE_V59.md](RELEASE_V59.md). Kütüphane kodu bu
düzeltme için değişmedi.
