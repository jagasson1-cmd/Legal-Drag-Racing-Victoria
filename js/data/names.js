// NPC driver display names for generated event opponents. Plain data, read by pickDriverName in js/systems/opponent-generation.js. Classic script: loads after js/data/events.js and before js/systems/opponent-generation.js; see docs/MODULARISATION.md.
// Given names only, with no ethnicity, gender or any other metadata, and no link to vehicle, performance, venue or progression. The first 17 given names are the original list, in its original order; Davo, the 18th original, is a nickname.
// Names already stored in saved events are never regenerated, so changing these lists only affects events generated afterwards.
const NPC_GIVEN_NAMES=[
  'Mick','Sarah','Jess','Rob','Tayla','Chris','Ari','Ben','Mia','Noah','Eli','Zoe',
  'Jay','Sam','Alex','Riley','Casey','Abdi','Abdullahi','Achol','Ahmed','Alessia','Amani','Amina',
  'Ananya','Angelo','Anjali','Arjun','Aroha','Ayen','Bilal','Brooke','Burak','Callum','Camila','Carla',
  'Charlie','Charlotte','Chidi','Chloe','Ciara','Con','Daniela','Declan','Deepa','Deng','Despina','Diego',
  'Dimitri','Duc','Dylan','Eleni','Elif','Ella','Emma','Emre','Ethan','Farah','Feng','Franco',
  'George','Gianni','Giulia','Hannah','Hao','Harpreet','Harry','Hassan','Hiba','Hui','Huy','Hyun',
  'Ioane','Ishaan','Ivan','Jack','Jamal','Jamie','Jia','Jin','Jiwoo','Joon','Jordan','Josh',
  'Joy','Jun','Karan','Karim','Kasia','Kate','Katerina','Kenji','Khoa','Kofi','Kosta','Kwame',
  'Lagi','Lan','Lauren','Layla','Lei','Liam','Linh','Luca','Lucia','Luke','Makur','Malia',
  'Manpreet','Marco','Matteo','Mehmet','Mele','Miguel','Mila','Ming','Minh','Morgan','Nadia','Nathan',
  'Neha','Ngoc','Nia','Nick','Nikhil','Olivia','Omar','Oscar','Panos','Paolo','Phuong','Priya',
  'Quang','Rahul','Raj','Rami','Rania','Reza','Rhea','Rohan','Rosa','Ruby','Ryan','Samir',
  'Sefa','Selam','Selin','Shirin','Simran','Sione','Sophia','Stavros','Stefan','Sunita','Tao','Tegan',
  'Tendai','Tevita','Thanh','Tharindu','Tom','Tony','Trang','Tuan','Tui','Vasili','Vikram','Viliami',
  'Vince','Vy','Wei','Wiremu','Xin','Yan','Yianni','Yohannes','Yousef','Yue','Yuna','Zainab'
];
const NPC_NICKNAMES=['Davo','Macca','Loz','Kaz','Simmo','Tez','Robbo','Jono','Benno','Tommo','Gazza','Hammo'];
// Share of the single name roll that selects a nickname (roughly one generated driver in eight).
const NPC_NICKNAME_SHARE=0.12;
