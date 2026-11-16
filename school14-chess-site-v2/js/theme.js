/*
  Цайвар / харанхуй горим.
  Хуудас зурагдахаас өмнө горимыг тохируулахын тулд энэ файлыг <head> дотор defer-гүй ачаална.
  Мөн <html> дээр «js» класс нэмнэ: CSS үүгээр JavaScript ажиллаж буйг мэдэж,
  гар утасны цэсийг эвхэх зэрэг сайжруулалтыг идэвхжүүлнэ.
*/
(() => {
  'use strict';

  const STORAGE_KEY = 'club-theme';
  const root = document.documentElement;

  root.classList.add('js');

  function savedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null; // Хувийн цонх зэрэгт localStorage хаалттай байж болно.
    }
  }

  function systemTheme() {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  root.dataset.theme = (savedTheme() || systemTheme()) === 'dark' ? 'dark' : 'light';

  document.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('.theme-toggle');

    function updateButtons() {
      const isDark = root.dataset.theme === 'dark';
      buttons.forEach((button) => {
        const icon = button.querySelector('span') || button;
        icon.textContent = isDark ? '☀' : '☾';
        button.setAttribute(
          'aria-label',
          isDark ? 'Цайвар горимд шилжих' : 'Харанхуй горимд шилжих',
        );
        button.setAttribute('aria-pressed', String(isDark));
      });
    }

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
        try {
          localStorage.setItem(STORAGE_KEY, root.dataset.theme);
        } catch {
          // Хадгалж чадаагүй ч горим энэ удаад солигдсон хэвээр байна.
        }
        updateButtons();
      });
    });

    updateButtons();
  });
})();
