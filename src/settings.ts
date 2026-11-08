import { defineAddonSettings } from '@pulsesync/addon-sdk'
export const settings = defineAddonSettings([{title:"SpotGlass",items:{
  "enabled": {
    "type": "boolean",
    "name": "Оформление SpotGlass",
    "description": "Главный переключатель оформления.",
    "default": true
  },
  "wide": {
    "type": "boolean",
    "name": "Широкая библиотека",
    "description": "Более широкая боковая библиотека в настольной раскладке.",
    "default": true
  },
  "panel": {
    "type": "boolean",
    "name": "Сейчас играет",
    "description": "Правая панель доступна от 1280 пикселей; в узком окне освобождает место для музыки.",
    "default": true
  },
  "compact": {
    "type": "boolean",
    "name": "Компактные треки",
    "description": "Уменьшить высоту строк треков до 48 пикселей.",
    "default": false
  },
  "green": {
    "type": "boolean",
    "name": "Зелёный акцент",
    "description": "Зелёные акценты. Выключите для нейтрального светлого акцента.",
    "default": true
  },
  "waveTile": {
    "type": "boolean",
    "name": "Кнопка «Моя волна»",
    "description": "Запуск Моей волны на странице рекомендаций без перехода на другую страницу.",
    "default": true
  },
  "hideAds": {
    "type": "boolean",
    "name": "Скрывать рекламные баннеры",
    "description": "Скрыть визуальные рекламные и промоблоки.",
    "default": true
  },
  "lrclib": {
    "type": "boolean",
    "name": "Тексты из LRCLIB",
    "description": "Запасной источник текстов. Название, исполнители, альбом и длительность трека отправляются на lrclib.net, если штатный текст недоступен.",
    "default": true
  }
}}] as const)
