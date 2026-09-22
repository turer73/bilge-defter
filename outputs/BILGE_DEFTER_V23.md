# Bilge Defter v23 - notlu PDF disari aktarma

## Sonuc

Her iki ayri Bilge Defter servisi v23'e guncellendi. Kullanim: Araclar -> Notlu PDF indir -> acik sayfa veya defterdeki PDF sayfalari -> PDF hazirla -> PDF indir.

- Kalem, fosforlu, silgi, Turkce metin ve gorseller PDF zeminiyle birlestirilir. Silgi alttaki PDF'yi silmez.
- Islem tamamen cihazdadir; belge sunucuya yuklenmez. Cevrim disi paket hazirsa internet olmadan kullanilir.
- En fazla 50 PDF sayfasi; 64 MB cikti siniri. Hazirlik iptal edilebilir. Hata veya iptalde eksik dosya sunulmaz; defter verisi degistirilmez.
- Yalniz PDF sayfalari aktarilir. Normal defter sayfalari ve PDF sinirlari disindaki notlar dahil edilmez; arayuz bunu aciklar.
- Mevcut 1000 px genislikli PDF goruntuleri JPEG olarak ciktiya gomulur. Sayfa orani korunur; ozgun baski olcusu, vektorler, secilebilir/aranabilir metin, baglantilar ve formlar korunmaz. Bu bir JSON yedegi degildir.
- Kayit/yedek semasi degismedi; v22 veri uyumu korunuyor.

## Kanit

- Yerel 137 kontrol: 96 mevcut temel/guvenlik/PDF, 13 medya, 10 arayuz, 8 PWA, 10 yeni PDF disari aktarma kontrolu.
- Canli Tailscale HTTPS: 10 PDF cikti + 6 PWA + 13 medya = 29 kontrol.
- Public davetli adres: 15 giris koruma kontrolu; izinsiz ve sahte kimlikli istekler uygulamayi alamadi.
- Indirilen PDF gercek PDF.js okuyucusuyla yeniden acildi; silinmis bolgede PDF zemini, kalem/fosforlu/gorsel pikselleri, Turkce metin, sayfa sirasi ve oranlar sinandi. 50 sayfali cikti yeniden acildi; 51 secim reddedildi.
- pypdf strict okuma ve bagimsiz Poppler goruntuleme de gecti; uretilen sayfa gorsel incelendi.
- Cevrim disi kullanim, kodlama/gorsel hatasi, iptal, dar ekran ve kayitlarin degismemesi sinandi.
- Fiziksel iPad/Safari indirme/paylasim davranisi bu surum icin henuz kullanici tarafindan dogrulanmadi. Public oturumda v23 guncelleme kabulunu origin testleri yerine gecmis saymiyoruz.

## Yayin ve geri donus

- Private: /opt/bilge-defter-test/releases/20260920-v23-pdf-export
- Davetli: /opt/bilge-defter-invited/releases/20260920-v23-pdf-export
- Paket SHA256SUMS ozeti: 0dec3e85f25bd974189b40d50dc8d8fbe0ec45d8eb769752d8299271ed14b3b5
- Private konteyner: bdef171402b23e34152ff7eaad8ac8fa8bd7d42780c5a14c068aa5ce2e8ffbec
- Davetli konteyner: f32b4b68a0e57eefcc6884f158426df088c6a0fb1f4338266ec1c0f88c508197
- Onceki v22 dizinleri ve rollback-before-v23 adli durdurulmus konteynerler saklandi. Eski yayin not verisini geri almaz; bu surumde sema degismedi.
- Diger calisan konteyner kimlikleri her yayin oncesi/sonrasi ayni. Bilge Arena, Cloudflare DNS/Access/cache kurallari ve Tailscale Serve degistirilmedi.
- Private baslangicta tek baglanti resetinden sonra sinirli yeniden deneme ile dogrulandi. Davetli baslangic dogrulamalari dogrudan gecti.
- Onceki tek kullanimlik tani sayfasi v22 dizininde saklidir; v23 paketine dahil edilmedi.

## Onceki guncelleme sorunu

Kullanici tani ekraninda 212 dosya / 0 sorun ve bekleyen worker installed goruldu. Tum uygulama pencerelerinin kapanip yeniden acilmasindan sonra kullanici “tamam duzeldi” diyerek v22 guncelleme sorununu giderilmis olarak dogruladi. HTML degistirme varsayimi dogrulanmadi; bu varsayimla guvenlik kurali degistirilmedi.

## Sonraki dilim

Takvim ve elle calisma plani. Bu surumde eklenmedi. AI, sozluk, hesap/esitleme veya Bilge Arena entegrasyonu yapilmadi.
