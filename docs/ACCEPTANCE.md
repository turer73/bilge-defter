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
| A7 | v51 -> v52 gerçek kurulu uygulama güncellemesi | Kaydedilmiş notlar ve hesap seçimi korunur |
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
