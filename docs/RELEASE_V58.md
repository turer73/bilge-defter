# v58 — kütüphaneden dönüş ve iki parmak kaydırma

## Yetki ve kapsam

Kullanıcı `Alalım` ile hazırlanan iki düzeltmenin yayınını onayladı.
Yalnız davetli web ve kütüphane kodu değişir. Hesap konteyneri yeniden kurulmaz
veya başlatılmaz; veritabanları, oturum ayarları, öğrenci sınırı, özel v46 adresi,
paylaşılan sunucu servisi ve Bilge Arena kapsam dışıdır.

Hazırlık ve cihaz kabul sınırları: [LIBRARY_RETURN.md](LIBRARY_RETURN.md).
Paket: `e39aa2e0087a62bb9bf4fa1cb4821efa59f232c7e459d3cc419801868fd21c4b`.

## Yayın işlemi

- `build-release-v58.py` yalnız commit edilmiş izinli dosyaları paketler;
  test edilmiş web paketi hash ile sabittir. Kaynak commit ve dosya hashleri
  `source-receipt.json` içinde tutulur.
- `deploy-v58.py`, v57'nin konteyner güvenlik/klonlama yardımcılarını kullanır;
  v57'nin API kurulum ve yayın akışını çağırmaz.
- Canlı v57 kodu, mount ve imajları doğrulanır. Kütüphanede yalnız
  `index.html`, `style.css`, `textview.py` değişebilir.
- Kapalı önizleme `127.0.0.1:18800`, ayrı boş yer imi deposu kullanır.
- Canlı yer imlerinin tutarlı SQLite yedeği özel `private/` dizininde alınır;
  yedek Git/pakete girmez. Tarayıcıdaki defter notlarının yedeği değildir.
- Önizleme geçince eski web/kütüphane konteynerleri durdurulup
  `-rollback-v58` adıyla saklanır; yeni kod aynı veri/sır mount'larını kullanır.
- Hata olursa v57 otomatik geri getirilir. Veri yedeği geri yüklenmez.
- Hesap ve diğer konteynerlerin kimlik/başlangıç zamanı ile paylaşılan servis
  süreci değişmemelidir. DNS/Cloudflare Access değiştirilmez.

Geri dönüş (yalnız v58 henüz etkin sürümken):

```sh
sudo python3 /opt/bilge-defter-classroom-v58/deploy-v58.py rollback
```

## Kabul sınırı

Otomatik testler fiziksel iPad'i kanıtlamaz. Dilara v58 açıldığını doğrulayıp
dolu sayfada iki parmak kaydırma, ardından kalemle devam etme ve kütüphane/PDF/
metin ekranındaki **Deftere dön** düğmesini denemeli. Uzun defterlerde kalan
serileştirme ve görünür çizgi çizim maliyeti bu sürümde kaldırılmadı.

## Doğrulanan yayın sonucu — 26 Eylül 2026

- Kaynak commit: `be8637d4a7645e183908808fb589f455ebbc45b5`;
  GitHub `repair/v57-stability` dalına gönderildi. `master` birleştirilmedi.
- Canlı `current` hedefi `/opt/bilge-defter-classroom-v58/ui`.
- Yeni web ve kütüphane etkin; kütüphane sağlık kontrolü **healthy**.
- `npm test`: **190** uygulama kontrolü geçti. Kütüphane **20** tarayıcı
  kontrolü ve **44** Python testi geçti; iki WebKit görüntüsü incelendi.
- Kapalı önizleme ve canlı origin: **237** HTTP dosya hash'i, **234** çevrimdışı
  varlık, **14** yetkisiz erişim reddi ve **6** kapalı özel yol doğrulandı.
- Bağımsız yayın sonrası kontrol: **254** makbuz dosyası ve konteyner içindeki
  **3** değişen kütüphane dosyası aynı hash'lerle doğrulandı.
- Hesap konteynerinin kimliği ve başlangıç zamanı birebir aynı; diğer
  konteynerler/paylaşılan servis de değişmedi. Kaynak ve yer imi mount'ları aynı.
- Web/kütüphane `-rollback-v58` konteynerleri durdurulmuş olarak saklandı;
  test konteynerleri de durduruldu. Veri geri yüklemesi yapılmadı.
- Dış `/` ve `/library/` adresleri davetli girişine yönleniyor. İlk Python
  varsayılan istemci başlığı 403 aldı; tarayıcı başlığıyla Windows ve sunucudan
  302 doğrulandı. Cloudflare ayarı değiştirilmedi. Gerçek hesapla canlı kabul
  veya fiziksel iPad testi bu yayın işleminde yapılmadı.
- Sunucu kanıtı: `/opt/bilge-defter-classroom-v58/live-proof.json`;
  yerel kopya: `outputs/v58-release/live-proof.json` (Git dışında).

Uygulama v58'e güncellenmeli; açık kütüphane sekmesi yenilenmeli. Gerçek cihazda
uzun sayfa/kaydırma/kaleme dönüş kabulü hâlâ kullanıcı testini bekliyor.
