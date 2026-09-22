# Bilge Defter v25 — metin ve görsel döndürme

21 Eylül 2026. Kullanıcı v24 güncellemesinin tamamlandığını doğruladı. Bu dilim yalnız istenen döndürmeyi ekler; takvim, AI ve eşitleme eklenmedi.

## Kullanım

Araçlar → Öğeyi düzenle → metin veya görsele dokunun.

- Mavi ↻ tutamacını sürükleyin: serbest açıda döndürme. Fareyle Shift basılıyken 15° aralıklarına oturur.
- ↶ 90° / ↷ 90°: sola veya sağa çeyrek tur; Açıyı sıfırla: yatay konuma dönüş.
- İçinden sürükleyerek taşıma ve ↘ ile oranlı boyutlandırma açı korunarak devam eder.
- Geri al son tamamlanan dönüşümü geri getirir. Bitti, normal yazma/iki parmakla kaydırma moduna döner.

Seçim modunda fare, kalem veya tek parmak kullanılabilir. Normal kalem modunun avuç koruması değişmedi. Özellik klavyeyle eklenen metin ve görsel nesneler içindir; serbest el çizgilerini nesne olarak döndürmez.

## Kayıt ve uyumluluk

Sürükleme sırasında yalnız önizleme vardır; bırakıldığında tek kayıt ve geri alma adımı oluşur. Mevcut iptal, kayıt hatası ve eski sekme çakışma korumaları kullanılır. Açı seçim çerçevesinde, tıklama alanında, görünürlük hesabında ve PDF çıktısında ortak geometriyle uygulanır.

İlk döndürme veri sürümünü 4'e geçirir; JSON yedeği biçim 6 olur. Eski 1–3 verileri ve 1–5 yedekleri okunur. Yeni döndürülmüş veri v24 ve öncesiyle uyumlu değildir: eski uygulama bunu yanlış çizmek yerine okumayı reddeder. Geri alma açıyı geri getirse de veri sürümü geriye düşürülmez. Yeni veriyi açmak için v25 veya uyumlu daha yeni sürüm gerekir; tarayıcı verilerini silmeyin.

## Doğrulama

- 167 yerel kontrol: 152 mevcut regresyon ve 15 yeni döndürme kontrolü.
- Canlı özel HTTPS: döndürme 15, yerleşim 15, PDF dışa aktarma 10, PWA 6 = 46.
- Davetli adreste 15 erişim kapısı kontrolü: yetkisiz/sahte oturum uygulama dosyalarını açamıyor. E-posta gönderilmedi; izinli oturum bu araçla açılmadı.
- Döndürülmüş resimde kırmızı/mavi piksel yerleri, eski dikdörtgenin dışında seçim, serbest 45° tutamaç, 90° düğmeleri, geri alma, iptal, açı korunarak boyutlandırma, içerik düzenleme, yeniden açılış, çevrim dışı kullanım ve indirilen JSON yedeğinin geri yüklenmesi doğrulandı.
- PDF %200 yakınlaştırma/kaydırma ve gerçek indirilen PDF'nin yeniden açılışı sınandı. Döndürülmüş Türkçe metin ve resim pikselleri doğrulandı. PDF becerisinin yönlendirmesiyle ayrıca pypdf strict ve Poppler kullanıldı; çıktı ile 390 px arayüz görsel olarak incelendi.
- Gerçek iPad/Android kalemiyle döndürme hissi ve kullanıcının kurulu v25 kabulü henüz sınanmadı. Otomatik testler tüm tablet modellerinde kabul anlamına gelmez.

## Yayın ve geri dönüş sınırı

İki adreste aynı 212 dosyalık uygulama paketi var:

- https://defter.bilgearena.com/
- https://klipper-2.tail1ade8e.ts.net:8443/

Private release: `/opt/bilge-defter-test/releases/20260921-v25-rotation`

Davetli release: `/opt/bilge-defter-invited/releases/20260921-v25-rotation`

Private konteyner: `dab533fa3071259ba1e002d6dcae21c33266231a552be5e7fea7f5d3b1755590`

Davetli konteyner: `9c70fb3bb54eca972a9a78cdda017405296f09f9c425a1cafc73b0a2eb8b93a4`

SHA256SUMS özeti: `6867d8d975f7af886a77882f0d99ecd77345c54dd6b70b37421a2dc46357ebd5`

Her yayın öncesi eski dizin/hash/konteyner kimliği doğrulandı. Sunulan dosyalar yeni paketle karşılaştırıldı. Önceki v24 dizinleri ve `rollback-before-v25` konteynerleri tutuldu. Diğer çalışan konteyner kimlikleri her iki işlemde değişmedi. Bilge Arena, DNS, Access, cache kuralları ve Tailscale değiştirilmedi.

Sunucu dosyaları geri alınabilir; ancak istemcide sürüm 4 veri oluşturulduktan sonra v24'e dönüş veri uyumlu değildir. Böyle bir durumda sürüm 4 okuyabilen düzeltme sürümü gerekir; eski yedeği kullanmak ancak yeni notların kaybı kullanıcıya açıkça anlatılıp yetkilendirildikten sonra düşünülebilir.

Güncellemede “Yeni sürüm hazır” görülünce kayıt tamamlanmasını bekleyin, yedek alın ve tanılama sayfası dahil tüm Bilge Defter sekme/uygulama pencerelerini kapatıp yeniden açın. Başlıkta v25 görünmeli. Sadece bir süre beklemek, eski açık pencereyi otomatik yeni sürüme geçirmez.

## Sonraki plan dilimi

Takvim ve elle çalışma planı; bu turda başlatılmadı. Önce kullanıcının gerçek cihazda yeni döndürme davranışını kabul etmesi bekleniyor.
