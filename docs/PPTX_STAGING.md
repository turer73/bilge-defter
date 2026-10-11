# Sunum hazırlığında geçici disk deposu

Yerel aday · 11 Ekim 2026 · CLAIM #102653. Yayın değildir.

## Akış

Her slayt çizildikten sonra görseli, hesaba özel ayrı bir IndexedDB hazırlık
deposuna yazılır. İşlemin tamamlanması beklenmeden sonraki slayt çizilmez.
Hazır ekranında sayfa listesinde görsel dizeleri tutulmaz; ilk slayt önizlemesi,
boyut/sıra bilgileri, aktarılacak eski kalem notları ve özgün dosya bellektedir.

**Deftere ekle** önce geçici slaytları sırayla okur. Bu okuma sırasında
**Vazgeç** kullanılabilir. Sonra mevcut `BilgeRasterImport.commit` yolu,
görselleri ve notları tekrar doğrulayarak tek karşılaştırmalı `app-writer`
işlemiyle deftere ekler. Bu yazma başladıktan sonra pencere kapatılamaz.
Kesin sonuç alınamazsa tekrar ekleme açılmaz; kullanıcı defteri yeniden açıp
kontrol etmelidir. Geçici deponun başarıyla yazılması, defterin kaydedildiği
anlamına gelmez.

## Sahiplik ve temizlik

Depo yalnız tam onaylı hesap kapsamıyla açılır; defterin veya eski bağımsız
sunumların veritabanlarını değiştirmez. Her hazırlığın rastgele kimliği ve
sahiplik belirteci vardır. Web Lock başlangıçtan temizliğe/kapanışa kadar tutulur.
Bu aynı-origin bağlamların iş birliği mekanizmasıdır, kimlik doğrulama değildir.

İptal, kaynak değiştirme ve hesap kilidi eski okumaları/yazmaları geçersiz kılar.
Temizlik yalnız kendi belirteciyle eşleşen hazırlığı siler. Temizlik hatası,
başarılı veya belirsiz defter kaydını yeniden denenebilir bir hataya çeviremez.
Kapanışta kalan artıklar sonraki hazırlık açılışında, en az 24 saat geçmişse ve
aynı Web Lock alınabiliyorsa, işlem içinde sahiplik/zaman yeniden doğrulanarak
silinir. Aktif hazırlık sırf eski diye silinmez. Aday taraması sınırlıdır;
tek açılışta bütün artıkların bulunması veya temizlenmesi garanti edilmez.
Aynı protokole ait bozuk eski bir hazırlık kaydı temizliği durdurursa yeni
hazırlık da güvenli biçimde durur; bu durumda otomatik depo sıfırlanmaz.

Sayfadan ayrılma (`pagehide`) bitmemiş hazırlığı/okumayı kapatır. Başlamış
defter yazımının mevcut sonucu-belirsiz koruması değiştirilmez. Bu mekanizma
gerçek işletim sistemi çökmesi veya iPad bellek baskısı kabulü değildir.

## Korunanlar ve sınırlar

- Dosya 20 MiB, 100 slayt, görsel başına 6 MiB ve aktarım toplamı 24 MiB
  dize uzunluğu sınırları korunur. Kalite ve sıkıştırma ayarları değişmez.
- Eski kalem notlarının doğrulaması ve 16 MiB aktarım sınırı korunur.
- JSON yedek, eşitleme, defter şeması ve önceki sürüm okuyucusu değişmez.
- Geçici depo veya Web Locks kullanılamıyorsa hazırlık durur; bütün slaytları
  sessizce RAM'de biriktiren geri dönüş yolu yoktur.
- Hazırlık diskte ek alan gerektirir; nihai kayıt kontrolü bu kullanımı da görür.
- **Nihai ekleme ve açık defter hâlâ bütün encoded görselleri belleğe alır.**
  Bu adım toplam RAM sınırı, ölçülmüş hız artışı veya tam lazy loading değildir.
- PDF hazırlama yolu bu değişikliğin kapsamında değildir. Yeniden başlatılmış
  uygulamada yarım hazırlığı otomatik sürdürme/ekleme yapılmaz.

## Doğrulama

Yeni testler: `npm run test:pptx-staging -- --out=outputs/pptx-staging-20261011/UNIQUE`.
Yeni/boş çıktı dizini gerekir. Yerel sentetik hesap ve belgeler kullanılır;
dış ağ istekleri engellenir. Sonuçlar ve başarısız denemeler ayrı raporlanır.
Canlı yayın ve gerçek iPad kabulü bu testlerin yerine geçmez.
