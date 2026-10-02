# v70 — PDF ve görselleri ayrı saklama (okuyucu) + JPEG PDF sayfaları

2 Ekim 2026. v69 sürüm notundaki "asıl çözüm"ün ilk yarısı. Yalnız web değişir; hesap servisi v68,
kütüphane, nginx beyaz listesi, veri, Access ve DNS aynı kalır.

## Neden iki aşama

Her kayıt defterin tamamını yazıyordu; PDF sayfalarının görüntüleri her kalem darbesinde yeniden
yazılıyordu (v69'da azaltıldı, kaldırılmadı). Çözüm, görüntüleri defter kaydından ayırıp bir kez
yazmak. Ama yeni kayıt biçimini **yazan** bir sürüm canlıya çıkıp geri dönülmesi gerekirse, eski
sürüm o biçimi okuyamaz ve öğrencinin defteri açılmaz. Bu yüzden:

- **v70 (bu sürüm):** ayrık biçimi her okuma noktasında okur, okuduğu anahtarları kayıtta korur;
  **yeni görüntü deposu yazmaz** (`ASSET_WRITE=false`). v70 → v69 geri dönüşü güvenlidir: v70 hiç
  anahtarlı kayıt üretmez.
- **v71:** yazmayı açar ve mevcut defterleri bir kez göç ettirir. v71 → v70 geri dönüşü güvenlidir:
  v70 anahtarlı kaydı okur.

## Biçim

- Görüntü (PDF sayfası `pdf.image` ya da eklenen görsel `strokes[].image`) ayrı bir IndexedDB
  anahtarında durur: `asset:<veri URL'sinin SHA-256'sı>` → `{data, t}`.
- Kayıtta görüntünün yerinde aynı anahtar yazar. Aynı görüntü (örneğin Çöp Kutusundaki kopya) bir
  kez saklanır.
- Bellekteki defter her zaman görüntüleri tutar; çizim, PDF dışa aktarma, JSON yedeği ve eşitleme
  değişmez. Anahtara çevirme yalnız kayıt metni üretilirken, sayfa sayfa yapılır; defterde hiç
  anahtar yokken sıcak yolda ek iş yoktur (kayıt metni v69 ile bayt bayt aynı).
- Bir anahtar ancak görüntüsünün diske yazıldığı biliniyorsa kullanılır; kayıt hiçbir zaman diskte
  olmayan bir görüntüyü göstermez.

## Ne değişti

- **Okuma:** açılış, "yükleme öncesi kopyayı geri getir" ve açılış hatasındaki kurtarma dışa
  aktarımı anahtarlı kaydı okur. Kurtarma dosyası artık saklı görüntüleri de içerir.
- **Eksik görüntü:** anahtarı olan ama görüntüsü bulunmayan kayıt sessizce görüntüsüz açılmaz;
  açılış kurtarma ekranında durur, hiçbir şey silinmez ya da yeniden yazılmaz (`MissingAsset`).
- **Kayıt:** sayfa önbelleği ve boştaki denetim anahtarlı biçimle çalışır (`storedText`); içe
  aktarma ve PDF ekleme de aynı biçimi yazar.
- **Eşitleme onayı:** kayıt anahtarlıysa, gönderilen defter de aynı biçime çevrilip karşılaştırılır.
  Aksi halde her denetimde "değişiklik var" sanılıp sonsuza dek yeniden gönderilirdi.
- **Yazıcı (kapalı):** görüntüye SHA-256 anahtarı verir, her görüntüyü kendi küçük işleminde bir kez
  yazar, yazım bitince sayfa önbelleğini yeniler ve kaydı anahtarlarla yazar. v70'te yalnız testlerde
  açılır.
- **JPEG PDF sayfaları:** yeni eklenen PDF'de fotoğraf ya da slayt ağırlıklı sayfa, PNG'nin %60'ından
  küçükse JPEG (kalite 0,88) olarak saklanır; metin sayfaları keskin PNG kalır. v69 JPEG'i okur.

## Ölçüm

Masaüstü, sentetik; Chromium/V8, sayfa + kayıt işçisi JS belleği (CDP):

| | yazıcı kapalı (v70 varsayılan) | yazıcı açık (v71) |
|---|---|---|
| 45 MB PDF defteri, kalem kaydı başına bellek tepesi | 371 MB | 7 MB |
| Kalem kaydı süresi | 277 ms | 29 ms |
| 3 görüntülü test defterinin kayıt boyutu | 384 KB | 1,6 KB |

- Ölçümdeki sentetik sayfalar aynı görüntüyü paylaştığı için göç tek görüntü yazdı. Gerçek PDF'de
  göç sayfa başına bir küçük yazımdır (bir kez); kalem kaydı maliyeti yine küçük kalır.
- iPad'de ölçülmedi.

## Bilinen sınırlar

- v70 kullanılmayan görüntüleri silmez (çöp toplama v71'de, yaşa bağlı ve kaydın gösterdiği
  görüntüleri koruyarak).
- Tam doğrulama (`validState`) hâlâ bütün görüntülerin biçimini denetler; tam kayıt ve açılış bu
  yüzden büyük defterde ağır kalır. Kalem kaydı önbellekli doğrulama kullanır.
- Bellekteki görüntüler hâlâ bellekte durur (bir kopya). Sayfa açıldıkça yükleme sonraki iş.

## Yerel doğrulama

- `verify-v70-assets.cjs` (Chromium + WebKit, 6×2 = 12 kontrol): yazıcı açıkken her görüntünün bir
  kez saklanması, kaydın ve her kalem kaydının yalnız anahtar taşıması; yazıcı kapalı yeni sayfanın
  anahtarlı kaydı bütün görüntüleriyle açması, PDF'i çizmesi, kayıtta anahtarları koruması ve tam
  görüntülü JSON yedeği vermesi; eşitleme onayının temiz kalması; anahtarlı yükleme öncesi kopyanın
  görüntüleriyle geri gelmesi; eksik görüntüde kurtarma ekranı, değişmeyen kayıt ve görüntülü
  kurtarma dosyası; JPEG/PNG seçimi.
- Tam regresyon (`verify-v70.cjs`: v64 listesi + v66–v70 paketleri, Chromium + WebKit) ve
  `verify-reliability.cjs` geçti (372 PASS). v61 değişmezi "kayıt metni = saklanan biçim"
  (`storedText`) olarak eşlendi; v69 paketinde tanı dosyası sürümü v70 olarak eşlendi.
  Paket özeti (SHA256SUMS): `0f9e4b5f…`.
- `test_deploy_v70.py` (sahte Docker, 6 kontrol).
- Fiziksel iPad testi yapılmadı.

## Yayın

Henüz yapılmadı. Kullanıcı onayı gerekir.

Geri dönüş (v70 ya da v69 canlıyken; web v69, hesap servisi zaten v68):

```sh
sudo python3 -B /opt/bilge-defter-classroom-v70/deploy-v70.py rollback
```
