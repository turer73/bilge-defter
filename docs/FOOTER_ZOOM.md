# İki parmakla kaydırma, alt kontrollerle yakınlaştırma

10 Ekim 2026 — `ee44150a3fdb3e500d573756cb29adae73cd152e` üzerine yerel aday.
Canlı sürüm, depolama şeması, sayfa ve dosya sınırları değiştirilmedi.

## Davranış

- Normal defter, PDF ve deftere alınmış PPTX sayfalarında iki parmak yalnız
  kaydırır. Parmak aralığı değişimi yakınlaştırma yapmaz.
- Alt `−` / `+` düğmeleri %25 adımlarla %100–%300 arasında çalışır.
- Yüzde düğmesi genişliğe sığdırır; yatay konumu sıfırlar.
- Kısa yatay ekranda alt düğmeler görünür kalır. Dokunma alanları en az
  44 × 44 CSS piksel; ekranın alt ve yan güvenli alanları korunur.
- Kalem/avuç koruması, iki parmak merkezinden kaydırma, pointer iptali ve
  kaydırma sonrası kayıt yolları aynı kaldı. Eski pinch durumu ve API kaldırıldı.
- Öğeyi yerleştirme/düzenleme modunda alt barın gizlenmesi değişmedi.
- Yeniden açılış davranışı değişmedi: normal sayfa ve sürekli sunum genişliğe
  sığar; bağımsız PDF kaydedilmiş zoom'u kullanır. Sunumun kaydedilmiş düşey
  konumu ve notları korunur. Ayrı eski PPTX pilot görüntüleyicisi kapsam dışı.

## Yerel kanıt

Chromium + masaüstü WebKit, Windows; sentetik hesap ve notlar, harici ağ kapalı.

| Kontrol | Sonuç |
| --- | --- |
| Yeni footer/pan davranışı, %100 ve %200, 844×390 ve 390×844 | 34/34 |
| Tam slayt ve çizim, DPR 1 | 54/54 |
| Tam slayt ve çizim, DPR 2 | 54/54 |
| Medya seçim/kayıt/önbellek yaşam döngüsü | 10/10 |
| Mevcut footer zoom regresyonu | 14/14 |
| Kalem/avuç/iptal regresyonu | 32 kontrol |
| Kaydırma-kayıt regresyonu | 6/6 |
| Eski/yeni hareket sözleşmesi ve kanıt doğrulayıcısı | 27/27 |

Yeni test, eski `ee44150` kaynaklarında iki motorda da PDF/PPTX için **3 piksel**
parmak aralığı farkında zoom'un 1'den 1.021428…'e değiştiğini yakaladı.
Normal sayfa kontrolleri eski kaynakta da geçti. Bu negatif kontrol kod
yolunu doğrular; fiziksel iPad'deki sorunun ölçümü değildir.

Başarısız ilk denemeler saklandı: `candidate-v1` 32/34; iki PPTX yeniden açma
beklentisi hatalı olarak %200 istiyordu. Eski kaynak ve `ensure()` ile mevcut
genişliğe sığdırma sözleşmesi doğrulanıp **test beklentisi** düzeltildi, ürün
yeniden açılış kodu değiştirilmedi. Kanıt doğrulayıcısındaki ilk self-testte de
beklenen hata metninin tire işareti düzeltildi; esas hata koşulu değişmedi.

Kanıt yolları:

- `outputs/footer-zoom/candidate-final/report.json`
- `outputs/footer-zoom/negative-ee44150/report.json`
- `outputs/footer-zoom/lifecycle-final/results.json`
- `outputs/slide-flow/dpr-1-footer-final/report.json`
- `outputs/slide-flow/dpr-2-footer-final/report.json`

Hareket sözleşmesi bilerek değiştiğinden iki tarihsel pinch beklentisi artık
açık `--gesture=pinch` / `--gesture=scroll-only` seçimiyle çalışır. Beklenti
uygulamadan otomatik çıkarılmaz. Eski paket `pinch`, aday `scroll-only` olmalıdır.
Eşli CI kanıtı v2 şeması ve yeni runner hash'iyle ayrılır; eski v1 kanıtı yeni
adayın onayı olamaz. 54 vaka, raster kalite eşikleri, üç AB/BA/AB çifti ve
Linux/provenance koşulları gevşetilmedi. Yeni footer testi CI'a eklendi.

## Önizleme ve açık kapılar

Önizleme: `http://127.0.0.1:8780/?preview=notebook` — yalnız bu bilgisayar,
sentetik yerel hesap; canlı hesaba veya notlara bağlı değil. Eski süreç dosyaları
bellekte tuttuğundan ilk başlatma `EADDRINUSE` verdi. Tam komutu ve yalnız
loopback dinlediği doğrulanan mevcut önizleme süreci yeni kaynakla başlatıldı.
Not deposu silinmedi; açık kullanıcı sekmesi otomatik yenilenmedi.

Yeni kaynakta tam tarihsel 26 süit, Linux CI/eşli koşular ve fiziksel iPad
henüz çalıştırılmadı. Bu sonuçlar canlı yayın onayı veya iPad performans
garantisi değildir. Commit/push/deploy yapılmadı; yerel sürüm etiketi v78 kaldı.

iPad kabulü: JSON yedeğinden sonra ayrı test sayfasında iki parmakla aşağı/yukarı
kaydırırken parmak aralığını değiştirin (%100 ve %200). Yüzde sabit kalmalı;
parmakları kaldırınca kalem hemen yazmalı. `+`, `−`, yüzdeye dokunma ve ekran
döndürme ayrıca denenmeli. Boyut/sayfa sınırı ve sayfa paneli sonraki ayrı işler.
