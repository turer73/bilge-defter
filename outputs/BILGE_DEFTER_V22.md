# Bilge Defter v22 — arayüz ve güncelleme

## Davetli PWA güncelleme sorunu — sonradan bulunan CDN kuralı

Kullanıcı kurulu masaüstü uygulamasının https://defter.bilgearena.com/ adresini kullandığını doğruladı; uygulama v20 ve yeni paket bulunamadı mesajında kalıyordu. Origin v22 doğrulaması tek başına authenticated public güncelleme yolunu doğrulamıyordu.

Cloudflare zone cache ruleset 200c5ef5642f4db9a36ecc1f653664e5, sürüm 5 içinde son genel kural /api/ ve /_next/static/ dışındaki tüm yolları cache=true, edge_ttl override_origin 7200 ile önbelleğe alıyordu. Hostname filtresi yoktu; /sw.js ve /offline-assets.json da eşleşiyordu. Bu, sunucunun private,no-store başlığını geçersiz kılabilen ve eski dosya sunumuna yol açabilen somut bir yapılandırma sorunudur. Kullanıcının authenticated dosya yanıtı doğrudan gözlemlenmediği için istemci sorununun tamamen çözüldüğü henüz iddia edilmez.

Yalnız (http.host eq "defter.bilgearena.com") için en sona cache=false istisnası eklendi: e392f668493d49b697530e5320279b18; ruleset sürümü 6. Önceki üç kural tam içerik karşılaştırmasıyla değişmemiş olarak doğrulandı. Yalnız bu host üzerindeki root, index.html, sw.js, offline-assets.json, release.json, pwa.js, media-workspace.js, pdf-workspace.js, ui-workspace.js, ui.css ve manifest.webmanifest URL'lerinin CDN kopyaları temizlendi. Tüm zone cache temizliği yapılmadı. Root/SW/manifest için girişsiz istekler hâlâ doğru Access alan adına 302 dönüyor. Kullanıcı notları, tarayıcı verisi, sunucu dosyaları ve DNS/Access değiştirilmedi.

Geri alma, yalnız yeni kural kimliğinin yeniden doğrulanıp kaldırılmasıdır; genel kurallar geri yazılmaz. Ancak bu, hatalı iki saatlik önbellek davranışını geri getirebilir. CDN temizliği cihaz verisi silmez; dosyalar origin'den yeniden alınabilir. Kurulu uygulamanın güncelleme sonucu kullanıcı kabulü bekliyor.

Teknik dayanak: [Cloudflare önbellek ayarları](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/) ve [son eşleşen kuralın önceliği](https://developers.cloudflare.com/cache/how-to/cache-rules/order/).

## Tamamlananlar

- Tailscale adresi v20, davetli adres v21 sunuyordu. Bu nedenle eski adresteki güncelleme kontrolü yeni paket bulamıyordu. İki ayrı yayın aynı v22 paketiyle güncellendi. Notlar yine adres başına bağımsızdır; otomatik eşitleme veya veri taşıma yapılmadı.
- Silgi geçişinin üzerinde hızlı Geri al düğmesi; boş sayfada ve etkin çizgi sırasında devre dışı. Mevcut çizim/metin/görsel geri alma yolunu kullanır.
- Daha sade başlık ve sayfa adı, küçük yüzer araç grubu, dokunmaya uygun hedefler, gruplandırılmış araçlar ve düzenlenmiş yan panel.
- Araçlar → Dış çerçeve: Orman, Gece, Grafit, Mürdüm, Kum ve özel renk seçici. Açık/koyu renge göre başlık yazısı otomatik değişir. Kâğıt, çizimler ve yedek biçimi değişmez; renk yalnız ilgili tarayıcıda saklanır. Tercih kaydı engellenirse yalnız bu oturumda uygulandığı belirtilir.
- Kurulum ekranı pencere sürümünü, sunucu sürümünü ve adres türünü gösterir. release.json önbellekten değil ağdan kontrol edilir; ulaşılamazsa güncel olduğunu iddia etmez. Açık not zorla yenilenmez.

## Nasıl açılır?

Mevcut adresinizde Araçlar → Kurulum ve çevrim dışı → Güncellemeyi denetle. Paket hazır olduğunda tüm Bilge Defter sekmelerini ve ana ekran uygulamasını kapatıp yeniden açın. Üstte v22 görünmeli. Önce bağımsız JSON yedek alın; tarayıcı verilerini silmeyin.

Adresler: https://klipper-2.tail1ade8e.ts.net:8443/ ve https://defter.bilgearena.com/

## Doğrulama

- Yerel: 96 önceki davranış, 13 metin/görsel, 8 PWA ve 10 yeni arayüz/güncelleme = 127 kontrol geçti.
- Gerçek Tailscale HTTPS: 8 arayüz, 6 PWA ve 13 medya = 27 kontrol geçti.
- Davetli public bağlantı: 15 erişim kontrolü geçti; yeni CSS, arayüz kodu, medya kodu ve sürüm bilgisi de girişe yönleniyor.
- Gerçek eski v20 önbelleği → v22 geçişi ayrı kontrollü tarayıcıda sınandı; bütün eski pencereler kapanana kadar bekliyor, sonra notlar korunuyor.
- Telefon, tablet ve kısa yatay ekran görüntüleri incelendi. Özel renklerde başlık yazısı kontrastı en az 4.5:1 olarak sınandı. Bunlar fiziksel tablet/kalem kabulünün yerine geçmez.

## Yayın ve koruma sınırı

İki yayın dizini: /opt/bilge-defter-test/releases/20260920-v22-ui ve /opt/bilge-defter-invited/releases/20260920-v22-ui. Her ikisinin SHA256SUMS özeti: 6a49d4b087bf6af9d1c77765f775dc303628caa77d83584a1889b590f716573d.

Önceki konteynerler durdurulmuş olarak saklandı: bilge-defter-test-rollback-before-v22 ve bilge-defter-invited-web-rollback-before-v22. Geri alma öncesi veri biçimi kontrol edilmeli: yeni metin/görsel içeren veriyi özel yayının eski v20 sürümü okuyamaz. Notları silmek veya zorla eski biçime çevirmek geri alma yöntemi değildir.

Diğer çalışan konteyner kimlikleri, Tailscale 8443 yönlendirmesi ve mevcut davetli tünel aynı kaldı. DNS/Access değişikliği yapılmadı. AI veya eşitleme eklenmedi.

## Görsel referanslar ve sonraki dilim

Uygulanan yaklaşım: sık işlemleri görünür tutmak, daha seyrek seçenekleri gruplamak, uygulama çerçevesini kâğıt renginden ayırmak. Referanslar: [Goodnotes araç çubuğu](https://support.goodnotes.com/hc/en-us/articles/8900755183631-Customize-the-toolbar), [Notability araç kutusu](https://support.gingerlabs.com/hc/en-us/articles/6272405402650-Customize-your-Toolbox), [OneNote odaklı sayfa görünümü](https://support.microsoft.com/en-us/onenote/onenote-help-and-learning/explore-full-page-view).

Sonraki plan işi: mevcut PDF + çizim + metin + görselleri içeren notlu PDF dışa aktarımı; ardından takvim/elle çalışma planı. Bu v22 diliminde PDF dışa aktarımı veya takvim uygulanmadı. Özgün PDF vektör verisi hâlâ saklanmadığı için dışa aktarmanın görüntü temelli kalite sınırları açıkça belirtilmeli; büyük belgeler ve fiziksel tablet performansı ayrıca ölçülmeli.
