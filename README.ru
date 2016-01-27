Версия node должна быть >= 0.12

Внешние зависимости:
redis

Внутренние зависимости:
необходимо устанавливать из папки node_modules/insight-api/
sudo npm install redis
sudo npm install inherits-js

К письму прикреплен архив с файлами патча
их необходимо распаковать в node_modules/insight-api/lib/

Основная логика в файле callback.js
Так же в самом начале файла есть конфиг:

// время проверки для не доставленных адресов 
var timeOutToCheckAddresses = 60000;

// кол-во подтверждений для отправки по колбеку 
var achivedConfirmations = [0,1,5];
// массив статусов при которых колбек считается доставленным
var arrOfStatusCodes = [200];

// префикс для логов в системе 
var prefixForLogs = '[DK changes for insight-API]';
