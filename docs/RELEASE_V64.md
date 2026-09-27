# v64 — FIPAT kaynak bağlantısı yeniden açılıyor

Kullanıcı 27 Eylül 2026'da anatomi kartındaki ilk bağlantının ("Kaynak adayı: FIPAT
Terminologia Anatomica, 2. baskı") açılmadığını bildirdi.

## Neden

Bağlantı `fipat.library.dal.ca` alan adındaydı. Bu alan adı artık yok: Cloudflare (1.1.1.1),
Google (8.8.8.8) ve klipper'ın DNS'i NXDOMAIN döndürüyor. Dalhousie Kütüphanesi'nin eski
`libraries.dal.ca/Fipat/…` sayfaları da 404. IFAA'nın kendi FIPAT sayfası hâlâ ölü adrese
bağlanıyor. Bağlantı 356 kavramın hepsinde aynı kaynak tanımından geldiği için hepsinde bozuktu.

## Düzeltme

Aynı belge Dalhousie'nin CDN'inde yayında:
`https://cdn.dal.ca/content/dam/dalhousie/pdf/library/FIPAT/TA2/FIPAT-TA2-Front-Matter.pdf`.
Adres değiştirilmeden önce içerik doğrulandı (yalnız yanıt kodu değil): 5 sayfalık PDF,
"TERMINOLOGIA ANATOMICA Second Edition … FIPAT … IFAA", 2019 yayını, 2020 IFAA kabulü; lisans
metni pilotun kaynak satırıyla birebir aynı (yayın CC BY-ND 4.0, tekil terimler kamu malı,
değiştirilmemiş PDF serbestçe dağıtılabilir). Yalnız `terminology-data.js`'teki elle yazılmış
kaynak satırı değişti; Wikidata'dan üretilen blok ve kavram etiketleri aynı.

TA2Viewer (ta2viewer.openanatomy.org, FIPAT ve Open Anatomy ortak görüntüleyicisi) çalışıyor ama
terim bazında bağlantı yolu bulunamadı; bu yüzden karta eklenmedi.

Pakette kullanıcıya açılan diğer dış bağlantılar (Wikidata, Google araması, kütüphane) çalışıyor.

## Yerel doğrulama

- `verify-terminology.cjs` **47 kontrol**; yeni kontrol: FIPAT kaynağı doğrulanmış CDN adresinde
  ve veride `fipat.library.dal.ca` geçmiyor.
- `verify-v62-dictionary.cjs`: kalp dışı bir pilot kavramın kartındaki kaynak bağlantısının
  `href`'i yeni adres.
- `npm test`: 19 suite geçti (259 s); v51, v52, v56–v63 temel paketleri Git'ten sabit hash'lerle yeniden
  üretildi (v63 = canlıdaki d592864d). Paket `SHA256SUMS` 7db781b5….
- Fiziksel iPad ve gerçek hesap testi yapılmadı.

## Yayın

Kullanıcı onayıyla ("test geçince canlıya al") 27 Eylül 2026'da canlıya alındı (kaynak `61b0eee`,
paket `SHA256SUMS` 7db781b5…, payload 36eed6d4…, nginx 3f3ef2ae… v63 ile aynı).

- `stage` ve `activate`: 238 HTTP hash, 235 çevrim dışı dosya, 14 yetkisiz istek reddi, 6 özel
  yol kapalı; kütüphane sağlıklı; hesaplar ve diğer servisler değişmedi.
- Bağımsız kontrol: canlı `release.json` = v64; `terminology-data.js`, `sw.js`, `index.html`
  baytları Git'teki `61b0eee` ile aynı; canlı veride `fipat.library.dal.ca` geçmiyor; yeni
  bağlantı `200 application/pdf`; v63 web konteyneri `-rollback-v64` adıyla durdurulmuş.

Geri dönüş (yalnız v64 etkin sürümken):

```sh
sudo python3 /opt/bilge-defter-classroom-v64/deploy-v64.py rollback
```
