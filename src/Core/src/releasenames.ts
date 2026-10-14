// Version names for the update key (his picks, 2026-10-14): a character from each of his shows in turn, "mix the
// shows". Jujutsu Kaisen, Fullmetal Alchemist, Naruto, Dragon Ball, Avatar, Demon Slayer, Attack on Titan,
// Hunter x Hunter, My Hero Academia, Studio Ghibli, Frieren. Version 1 is Gojo, 2 Edward, 3 Naruto, and so on.
export const SHOWS: string[][] = [
  ['Gojo', 'Yuji', 'Megumi', 'Nobara', 'Sukuna', 'Nanami', 'Todo', 'Maki', 'Toge', 'Yuta'],
  ['Edward', 'Alphonse', 'Mustang', 'Hawkeye', 'Winry', 'Armstrong', 'Hughes', 'Scar', 'Izumi', 'Greed'],
  ['Naruto', 'Sasuke', 'Kakashi', 'Sakura', 'Itachi', 'Jiraiya', 'Gaara', 'Hinata', 'Shikamaru', 'Minato'],
  ['Goku', 'Vegeta', 'Gohan', 'Piccolo', 'Trunks', 'Bulma', 'Krillin', 'Beerus', 'Whis', 'Goten'],
  ['Katara', 'Sokka', 'Toph', 'Zuko', 'Iroh', 'Appa', 'Momo', 'Azula', 'Suki', 'Roku'],
  ['Tanjiro', 'Nezuko', 'Zenitsu', 'Inosuke', 'Rengoku', 'Giyu', 'Shinobu', 'Tengen', 'Muichiro', 'Mitsuri'],
  ['Eren', 'Mikasa', 'Armin', 'Levi', 'Hange', 'Erwin', 'Reiner', 'Sasha', 'Jean', 'Annie'],
  ['Gon', 'Killua', 'Kurapika', 'Leorio', 'Hisoka', 'Netero', 'Chrollo', 'Meruem', 'Bisky', 'Kite'],
  ['Deku', 'Bakugo', 'Todoroki', 'All Might', 'Uraraka', 'Iida', 'Aizawa', 'Kirishima', 'Tsuyu', 'Hawks'],
  ['Totoro', 'Kiki', 'Chihiro', 'Howl', 'Calcifer', 'Ponyo', 'Haku', 'No-Face', 'Sophie', 'Jiji'],
  ['Frieren', 'Fern', 'Stark', 'Himmel', 'Heiter', 'Eisen', 'Sein', 'Ubel', 'Land', 'Serie'],
];
/** The name for version n (1-based): round and round the shows, the next character each time a show comes up again. */
export function releaseName(n: number): string {
  const i = Math.max(0, n - 1), show = SHOWS[i % SHOWS.length]!, k = Math.floor(i / SHOWS.length);
  return k < show.length ? show[k]! : `${show[k % show.length]} ${Math.floor(k / show.length) + 1}`;
}
