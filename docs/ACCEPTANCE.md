# Gerçek kullanıcı kabul kapıları

Durum: fiziksel cihaz/sınıf kabulü NOT TESTED. Otomasyon sonuçları bunun yerine geçmez.

| Kapı | İşlem | Geçiş koşulu |
|---|---|---|
| A1 | İki yönetici kendi cihazlarında e-posta koduyla giriş | Doğru rol, tek dönüş, kayıtlar korunur |
| A2 | Onaylı test öğrencisini elle ekle; öğrenci kodla girsin | Liste dışı erişim yok; onaydan önce/sonra yetki doğru |
| A3 | Aynı öğrenci iki cihaz; iki öğrenci aynı test cihazında ayrı profiller | Hesaplar birbirinin notlarını göremez; doğru eşitleme/parola akışı |
| A4 | Not yaz, interneti kes, uygulamayı açık tut, yeniden bağlan | Yerel kayıt korunur; eski sunucu kopyası sessizce ezmez |
| A5 | Askıya al ve tekrar etkinleştir | API ve uygulama yetkisi doğru; yerel kopyaların uzaktan silinmediği açık |
| A6 | iPad/Safari, Android kalem, Windows kurulu PWA | Boş/dolu sayfa, avuç, yön değişimi, PDF ve 40 dakika ders testi |
| A7 | Kullanıcının mevcut kurulu sürümünden yayınlanacak adaya güncelleme | Her iki sürüm kaydedilir; notlar, hesap seçimi ve araç tercihleri korunur |
| A8 | Ayrı yedek oluştur, izole hedefe geri aç | İçerik/bütünlük doğrulanır; canlı DB üzerine yazılmaz |
| A9 | Küçük pilot sonra kademeli sınıf | Önce 2 yönetici + 3-5 öğrenci; kritik hata yoksa 48+2 |
| A10 | Ücretsiz kota ve sunucu kapasitesi | Sınıfa eklemeden önce gerçek kuruluş kotası yeniden okunur; ücretli plan açılmaz |

Her test: tarih, cihaz/OS/tarayıcı, uygulama sürümü, anonim kullanıcı kodu,
beklenen/gözlenen sonuç, kanıt, hata ve tekrar koşusu. Gerçek e-posta/OTP
rapora yazılmaz; OTP kullanıcı tarafından girilir. Test hesabı silme/askı
gibi işlemler yalnız bu amaçla seçilen hesaplarda yapılır.

İşletim açıkları: bağımsız yedek zamanlaması ve saklama/silme politikası,
PDF ağırlıklı 5 MB sunucu yedeği kotası, token yenileme planı, destek/geri dönüş
sorumlusu. Şifreli eşitleme bağımsız yedek değildir. İndirilmiş çevrimdışı
kopya uzaktan geri alınamaz. Yeni ücret veya geniş erişim için ayrı karar gerekir.

## 27 Eylül güvenilirlik paketi için ek kapılar

- R1: Aynı defterle önce/sonra 40 dakika iPad testi; boş, yoğun, PDF, avuç ve iki parmak geçişleri. Kalemin kesilmesi ve kaydırma atlaması ayrı gözlem.
- R2: Bozuk kayıt/erişilemeyen depolama: silme olmadan uyarı ve mümkünse kurtarma dosyası. Kurtarma dosyası özel not içerebilir; performans raporu içermez.
- R3: 5 MiB sınırı altı/üstü şifreli yedek, Türkçe UTF-8 dahil. Yerel kayıt ve bağımsız JSON yedek etkilenmez; fazla boyutta tekrar gönderim fırtınası oluşmaz.
- R4: Değişmeyen defterde 304 ve boş HTTP gövdesi; değişen defterde 200, eski CAS etiketinde 412. Başka hesap hiçbir koşulda 304 ile bile varlık bilgisi alamaz.
- R5: Tercihler yalnız aynı cihaz/tarayıcı hesabında; yeni hesap varsayılan araçlarla başlar. Depolama kapalıysa uygulama açılabilir, tercih kalıcılığı vaat edilmez.
- R6: İsteğe bağlı süre raporu en fazla 200 örnek/ölçüm; kalem koordinatı, metin, e-posta, parola, token yok. Otomatik gönderim yok. Süre raporu fiziksel kalem gecikmesi değildir.

İlk uygulama ve test kanıtı: `docs/RELIABILITY_PACKAGE_1.md`. Araştırma: `docs/UX_PERFORMANCE_RESEARCH_2026-09-27.md`.
