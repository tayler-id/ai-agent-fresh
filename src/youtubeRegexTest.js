const urls = [
  "https://www.youtube.com/watch?v=eM_Tg8_BGx4",
  "https://www.youtube.com/watch?v=eM_Tg8_BGx4&t=1s",
  "https://youtu.be/eM_Tg8_BGx4",
  "https://www.youtube.com/embed/eM_Tg8_BGx4",
  "https://www.youtube.com/v/eM_Tg8_BGx4"
];

const regex = /(?:v=|\/)([0-9A-Za-z_-]{11})/;

for (const url of urls) {
  const match = url.match(regex);
  console.log(`URL: ${url}`);
  console.log(`Extracted videoId: ${match ? match[1] : "NO MATCH"}`);
}
