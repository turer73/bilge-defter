# v72 — v71 incelemesinin düzeltmeleri

2 Ekim 2026. Codex'in v71 incelemesi (not #101716, bulgular disc#2053–2056) üzerine. Yalnız web
değişir; hesap servisi v68, kütüphane, nginx beyaz listesi, veri, Access ve DNS aynı kalır. Kayıt
biçimi v71 ile aynıdır.

## Bulgular ve düzeltmeler

- **#2053 (P1) — eşitlemenin boyut ön kontrolü küçük kayda bakıyordu.** v71'de görüntüler anahtara
  geçince `lastSaveBytes` KB'a iniyor; eşitleme ise her düzenlemeden sonra görüntülü tam metni
  serileştirip şifrelemeye çalışıp ancak sonra 5 MiB sınırında reddediyordu. Artık alt sınır
  görüntülerden hesaplanır (`syncCertainlyTooLarge`): görüntüler ASCII'dir ve en az kendi boyutları
  kadar yer tutar; kaydın kalanı en az üçte biri kadar. Bu, v71'in benim kaçırdığım bir yan etkisiydi.
- **#2054 (P1) — yarıda kalan göç kotayı tüketiyordu.** Görüntüler tek tek yazılıyor ama kayıt ancak
  hepsi başarılıysa anahtara geçiyordu. Ortada cihaz dolarsa yazılanlar, satır içi kopyalarıyla
  birlikte diskte kalıyordu. Artık yazılabilen görüntüler hemen kullanılır, kayıt küçülür ve satır
  içi kopyaların yeri boşalır; hata tanı günlüğüne (kaç görüntü yazıldığıyla) düşer ve kalan göç 5 dk
  sonra yeniden denenir.
- **#2055 (P2) — görüntüsüz defterde temizlik hiç çalışmıyordu.** Temizlik, bellekte hiç saklı görüntü
  yoksa erken dönüyordu; son görüntü silinince eski yetimler hiç toplanmıyordu. Artık disk her zaman
  taranır; kurallar aynıdır (adsız, açık sayfada kullanılmıyor, 7 günden eski).
- **#2056 (P2) — PDF ekleme ve yedek yükleme göçü başlatmıyordu.** Bu yollar kaydı doğrudan yazıyor ve
  göç taramasını zamanlamıyordu; görüntüler bir sonraki kayda kadar satır içi kalıyordu. Artık ikisi
  de taramayı zamanlar. Ek olarak, tarama sürerken gelen istek artık kaybolmaz: tarama bitince yeniden
  zamanlanır (aksi halde aynı açık başka yoldan geri gelirdi).

## Codex yeniden incelemesi (not #101718, disc#2058)

- **#2053 kısmi kalmıştı:** sınır görüntüleri tekil sayıyordu; eşitleme metni kopyalanmış sayfa ve Çöp
  Kutusu tekrarlarını ayrı ayrı taşır. Artık her tekrar sayılır (`imageOccurrenceBytes`), depolama
  tekilleştirmesi aynı kalır. Test gerçek eşitleme yolundan geçer (taklit sunucu, parola, kopya ve Çöp
  Kutusu durumları): düzenlemelerden sonra büyük metin kodlanmaz, sunucuya istek gitmez.
- **#2058:** bekleme süresi dolunca yeniden deneme zamanlanmıyordu. Artık ayrı bir zamanlayıcı var;
  sayfa gizliyse görünür olunca dener. Test sanal saatle, bekleme süresine ve taramaya elle dokunmadan.
- Ek yarış: zamanlayıcı bir tarama sürerken tetiklenirse istek kayboluyordu; artık hatırlanır.
- Negatif kayıtlar `outputs/v72-negative/` (v71'e karşı 4/4 blok kalır; incelenen `e48f782`'ye karşı
  #2055 dışındaki 3 blok kalır).

## Yerel doğrulama

- `verify-v72-fixes.cjs` (Chromium + WebKit, 6×2 = 12 kontrol): kopya sayfa ve Çöp Kutusu için
  gerçek eşitleme yolu, kısmi göç ve kendiliğinden yeniden deneme, görüntüsüz defterde temizlik,
  PDF/yedek yükleme ve devam eden tarama yarışı, yayınlanmış v71 paketinin v72 defterini açması.
- **Negatif kontrol:** her bulgunun testi v71'e karşı ayrı ayrı (`ONLY=n`) davranış olarak kalıyor:
  #2053 "images over 5 MiB hold sync" iddiası; #2054 kısmi göç 0 döndürüyor; #2055 temizlik 0
  siliyor; #2056 "not keyed: 1 assets, 1 inline".
- `c7144ed` sonrası tam regresyon 2 Ekim 2026 21:46 (Türkiye) tamamlandı:
  `verify-v72.cjs` içindeki 26 regresyon grubu ve `verify-reliability.cjs` içindeki 26 ek
  güvenilirlik kontrolü geçti (`outputs/v72-regression.log`: `EXIT_V72 0`, `EXIT_REL 0`).
  Yerel Chromium/WebKit kontrolleri; fiziksel iPad veya canlı e-posta girişi değildir.
- `node work/build-invited.cjs` yeniden çalıştırıldı: 235 çevrim dışı varlık, 238 yayın dosyası.
  Paket manifestinin SHA-256 özeti:
  `a602e5241d06aefa7b0f9aea2976bb81fb2ccc071fff5c816a01c812adcd93dc`.
- `python -B work/test_deploy_v72.py` yeniden çalıştırıldı: sahte Docker ile 6/6 geçti.
- Fiziksel iPad testi yapılmadı.

## Öneri (Codex)

Öğrenciler yaygın kullanmadan önce JSON yedeği almaları. Geri dönüş v70'in altına inmemeli (v71'den
bu yana geçerli).

## Yayın

Kullanıcının 2 Ekim 2026 tarihli “işi sen devral ve tamamla” isteğiyle Codex devraldı
(merkezi CLAIM #101728; önceki Claude CLAIM #101717, devir notu #101724).
Bu kayıt aşamasında canlı yayın henüz yapılmadı. Son kaynak commit'inden paket üretimi,
GitHub kontrolleri, izole önizleme ve geri dönüş provası geçmeden etkinleştirme yapılmaz.
Hesap servisi, kütüphane, veri, Access ve DNS kapsam dışında kalır.

Geri dönüş (v72 ya da v71 canlıyken; web v71):

```sh
sudo python3 -B /opt/bilge-defter-classroom-v72/deploy-v72.py rollback
```
