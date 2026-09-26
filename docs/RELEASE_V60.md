# v60 — kaydın ağır işi kalemin iş parçacığından çıktı; push dürüstlüğü

Kullanıcı 26 Eylül 2026'da kalan açık işlerin kapatılmasını istedi (claim 101519).

## Neden

Sentetik ölçümde (v59) her kayıt bütün defteri ana iş parçacığında yaklaşık altı kez
işliyordu: doğrulama, `JSON.stringify`, `JSON.parse`, IndexedDB'den geri okuma,
çakışma karşılaştırması için yeniden `stringify` ve yazma. Kayıt kalem kaldırıldıktan
300 ms sonra ve uzun yazımda 5 saniyede bir çalıştığı için, büyük defterde bu süre kalemin
takılması olarak hissedilir (#1881, #1871).

| Defter (sentetik) | Masaüstü WebKit en uzun kilit | 4× yavaş Chromium en uzun kilit |
|---|---|---|
| 8 MB (10 sayfa) | 50 ms | 212 ms |
| 36 MB (30 sayfa) | 218 ms | 1794 ms |
| 97 MB (60 sayfa) | 628 ms | 4793 ms |

Ayrıca eşitleme açıldığında bildirim izni zaten verilmişse push aboneliği kuruluyor ve
"bildirimler açık" yazılıyordu. Oysa sunucu gönderimi güvenlik için kapalıydı (#1861).

## Değişiklikler

1. `save-worker.js` (yeni) ve `index.html`: ana iş parçacığı yalnız doğrular ve anlık
   görüntüyü bir kez `JSON` metnine çevirir. Ayrıştırma, geri okuma, tam `JSON`
   karşılaştırması ve yazma worker'da yapılır. Kayıt biçimi, `before-import` kurtarma
   kopyası, `sync-state-v2` işareti ve çakışma anlamı birebir aynıdır; v59'a geri dönüş
   veri biçimi açısından güvenlidir.
   - Worker kurulamazsa eski ana iş parçacığı yolu kullanılır.
   - Worker çökerse ya da 60 saniye yanıt vermezse bir sonraki kayıt güvenli çakışma yoluna
     düşer; bilinmeyen bir temel karşılaştırmadan asla geçmez.
   - Nesne yerine metin gönderilir: WebKit'te nesne kopyalamak eski yolun en uzun kilidi
     kadar pahalı çıktı (270 ms'ye 244 ms), metin kopyası ucuz.
2. `sync-workspace.js`: push aboneliği kurulmaz, "bildirimler açık" gösterilmez, önceki
   sürümden kalan abonelik bırakılır. Planlayıcının yerel hatırlatmaları etkilenmez.
3. `classroom-nginx.conf`: v54'ten beri yalnız sunucuda duran canlı yapılandırma önce
   bayt bayt kaydedildi (`73f3df8`, `0efd97f1`), ardından izin listesine yalnız
   `save-worker.js` eklendi (`3f3ef2ae`). Yeni dosyanın izin listesinde olmaması #1860'daki
   "güncelleme 404" hatasını tekrarlardı.

Kütüphane, hesap servisi, veritabanları, Access/DNS değişmez. Yayın yalnız davetli web
konteynerini değiştirir; kütüphane `/opt/bilge-defter-classroom-v58/library` ile çalışır.

## Yerel doğrulama

- `npm test`: 12 suite geçti; v51, v52, v56, v57, v58 ve v59 temel paketleri Git'ten sabit
  hash'lerle yeniden üretildi.
- `verify-v60-save.cjs`, Chromium ve WebKit, **13 kontrol**: worker yolu etkin; kayıt eski
  yolla aynı `JSON` biçiminde ve yeniden açılışta korunur; eski ikinci sekmenin yazımı
  reddedilir, disk ilk sekmeyi tutar; yedek yüklemede önceki defter `before-import`'ta
  kalır; worker hatasından sonra kayıt çakışma olarak durur ve disk değişmez; worker yokken
  eski yol ve çakışma denetimi çalışır; push aboneliği ve "bildirimler açık" paketten çıktı.
- 36 MB'lık sentetik defterde kaydın ana iş parçacığını kilitlediği en uzun süre (iki koşu):
  WebKit 293 → 166 ms ve 221 → 110 ms; Chromium 244 → 121 ms ve 218 → 94 ms.
  Kilit kabaca yarıya iner; tamamen kalkmaz, çünkü bütün defterin `JSON`'a çevrilmesi hâlâ
  ana iş parçacığındadır. Sayfa bazlı kayıt ancak cihaz ölçümü gerektirirse ayrı sürüm işidir.
- Mevcut performans suite'i (`dbPut` sarmalayıcısı, ikinci sekme çakışması, kota hatası),
  v59 → v60 gerçek servis worker güncellemesi ve çevrimdışı yeniden açılış worker yolu
  üzerinden geçti.
- #1862 (takvimde tarih/düğme çakışması) v59 derlemesinde Chromium ve WebKit, 7 ekran
  boyutunda ölçüldü: çakışma, taşma veya sayfa hatası yok; kayıt kapatıldı.
- Paket: 238 dosya, 235 çevrimdışı varlık, SHA256SUMS
  `d325132b704ab2790111a32a921cc2816b62164d9af172b1b8cf42bec9b679dd`.
- Fiziksel iPad ve gerçek hesap testi yapılmadı.

## Özel adres

26 Eylül'de kullanıcı JSON yedeğini aldığını bildirdi; `bilge-defter-test` konteyneri
durduruldu (silinmedi) ve `tailscale serve` `:8443` eşlemesi kaldırıldı. Geri açma:
`docker start bilge-defter-test` ve
`sudo tailscale serve --bg --https=8443 http://127.0.0.1:18787`.
Kopya ve not: `/opt/bilge-defter-test/closed-20260926/`.

## Yayın

Henüz yapılmadı. Sıra: `build-release-v60.py` → klipper'da `deploy-v60.py prepare`,
`stage` (yalnız `127.0.0.1:18800`), kullanıcı onayı, `activate`.

Geri dönüş (yalnız v60 etkin sürümken):

```sh
sudo python3 /opt/bilge-defter-classroom-v60/deploy-v60.py rollback
```
