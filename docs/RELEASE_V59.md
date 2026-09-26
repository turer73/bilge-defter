# v59 — kütüphane aynı pencerede, güncelleme sayımı düzeltmesi

Kullanıcı 26 Eylül 2026'da işin Claude oturumuna devrini ve v59 hazırlığını istedi.
Codex'in v58 claim'i kapanmıştı (not 101513); bu iş claim 101514 altında yapıldı.

## Neden

- v58'de defter kütüphaneyi `window.open(..., '_blank')` ile yeni sekmede açıyordu.
  Kütüphanedeki **← Deftere dön** o sekmede defteri yeniden yüklediği için açık defter
  sekmesine dönülmüyor, ikinci bir defter penceresi oluşuyordu. Kurulu iPad uygulamasında
  yeni sekme uygulamanın dışındaki tarayıcı görünümünde açılabildiğinden dönüş, kullanıcının
  kendi notlarını göstermeyebilirdi (merkezi kayıt #1884). Alıntı aktarımı (`quote.js`)
  zaten aynı sekmede deftere dönüyordu; iki akış bu sürümde aynı modele geldi.
- Servis worker'ın tek dokunuşla güncelleme onayı `/library/` dahil tüm aynı-origin
  pencereleri sayıyordu; açık bir kütüphane sekmesi **Güncellemeyi yükle**'yi bekletiyor,
  mesaj da kütüphane sekmesinden söz etmiyordu.

## Değişiklikler

1. `dictionary-workspace.js`: Kütüphane (ana menü ve sözlükteki **Kütüphanede ara**) aynı
   pencerede açılır. Önce açık düzenleme denetlenir (kalem, içe aktarma, PDF, medya taslağı,
   planlayıcı), ardından `flushSave` ile kayıt diske yazılır. Kayıt tamamlanamazsa veya
   düzenleme açıksa sayfadan çıkılmaz ve nedeni gösterilir. Çevrim dışı uyarısı aynı kalır.
   Başka bir origin'de açılan defter (örn. özel adres) yeni sekme kullanır; orada dönülecek
   defter aynı depolamada değildir.
2. `sw.js`:
   - Güncelleme onayı yalnız defter pencerelerini sayar. Kütüphane penceresi engel değildir;
     ikinci bir defter penceresi eskisi gibi bekletir.
   - `/library/` sayfa gezinmesi ağ hatası, 5xx veya 401/403 alırsa ham hata yerine
     "Kütüphane şu an açılamadı" sayfası ve **← Deftere dön** bağlantısı döner. Kütüphanenin
     API ve dosya istekleri değişmeden geçer.
3. `pwa.js`: bekletme mesajı yalnız defter pencerelerini anlatır.
4. `ui-v2/bilge-defter-ui.js`: "yeni sekme" ifadeleri kaldırıldı.

Kütüphane kodu, hesap servisi, veritabanları, Cloudflare Access/DNS ve özel v46 adresi
değişmez. Yayın yalnız davetli web konteynerini değiştirir; kütüphane konteyneri
`/opt/bilge-defter-classroom-v58/library` kod dizininde, yeniden başlatılmadan çalışır.

## Yerel doğrulama

- Ortam: Windows, Node 24.13.0, Playwright 1.62.1 (`NODE_PATH`), Windows `tar`
  (`cmd` üzerinden). Git Bash'teki GNU `tar` `D:` yolunu uzak sunucu sanıp durur.
- Değişiklikten önce v58 paketi aynı ortamda yeşil geçti (113 sn); v51, v52, v56, v57 ve
  v58 temel paketleri Git'ten sabit hash'lerle yeniden üretildi.
- `verify-v59-library.cjs`: Chromium ve WebKit, 390 ve 820 genişlik, **20 kontrol**.
  Bekleyen kalem kaydı diske yazılmadan çıkılmaz; tek pencere kalır; dönüşte aynı sayfa ve
  başlık açılır; sözlük terimi yalnız fragment'te taşınır; açık taslak, çevrim dışı durum ve
  kayıt hatası çıkışı durdurur.
- `verify-v59-update.cjs`: gerçek servis worker ile v58 → v59, **6 kontrol**. İkinci defter
  penceresi hâlâ bekletir; açık kütüphane penceresi bekletmez; 502, 401 ve bağlantı
  kopmasında dönüş sayfası gelir; dönüşte kayıtlı defter açılır.
- Negatif kontrol: aynı iki test eski kodda beklenen adımda başarısız oldu. Kütüphane testi
  v58'de ilk gezinmede, güncelleme testi v57 → v58 zincirinde "kütüphane penceresi
  bekletmez" adımında durdu.
- Paket: 237 dosya, 234 çevrimdışı varlık, SHA256SUMS hash'i
  `ebc50c12462b8d55f7ff14621b2f1b8123d0d6ffd0e16472d40698ef4ef60f8c`.
- Fiziksel iPad ve gerçek hesap testi yapılmadı.

## Ayrı işletim düzeltmeleri (26 Eylül)

- klipper `/opt/linux-ai-server`: canlıda commit'siz duran push containment yaması
  `a601203` ile yerel dalda commit'lendi. Dosya hash'i (`78813c82…`) ve servis süreci
  değişmedi; `infra/monitoring/prometheus.yml` değişikliğine dokunulmadı.
- 21 Eylül'den kalan, hiçbir konteynerin kullanmadığı `alpine:latest` ve
  `python:3.12-alpine` imajları silindi (#1883).

## Yayın

Henüz yapılmadı. Sıra: `build-release-v59.py` → klipper'da `deploy-v59.py prepare`,
`stage` (yalnız `127.0.0.1:18800`), kullanıcı onayı, `activate`.

Geri dönüş (yalnız v59 etkin sürümken):

```sh
sudo python3 /opt/bilge-defter-classroom-v59/deploy-v59.py rollback
```
