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

## Yerel doğrulama

- `verify-v72-fixes.cjs` (Chromium + WebKit, 5×2 = 10 kontrol): bulgu başına bir test ve yayınlanmış
  v71 paketinin v72 defterini açması.
- **Negatif kontrol:** her bulgunun testi v71'e karşı ayrı ayrı (`ONLY=n`) davranış olarak kalıyor:
  #2053 "images over 5 MiB hold sync" iddiası; #2054 kısmi göç 0 döndürüyor; #2055 temizlik 0
  siliyor; #2056 "not keyed: 1 assets, 1 inline".
- Tam regresyon (`verify-v72.cjs`: v64 listesi + v66–v72 paketleri, Chromium + WebKit) ve
  `verify-reliability.cjs` geçti (396 PASS). Paket özeti (SHA256SUMS): `598fd83b…`.
- `test_deploy_v72.py` (sahte Docker, 6 kontrol).
- Fiziksel iPad testi yapılmadı.

## Öneri (Codex)

Öğrenciler yaygın kullanmadan önce JSON yedeği almaları. Geri dönüş v70'in altına inmemeli (v71'den
bu yana geçerli).

## Yayın

Henüz yapılmadı. Kullanıcı onayı gerekir.

Geri dönüş (v72 ya da v71 canlıyken; web v71):

```sh
sudo python3 -B /opt/bilge-defter-classroom-v72/deploy-v72.py rollback
```
