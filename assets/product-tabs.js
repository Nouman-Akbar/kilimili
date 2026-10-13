if (!customElements.get('product-tabs')) {
  customElements.define(
    'product-tabs',
    class ProductTabs extends HTMLElement {
      connectedCallback() {
        this.tabs = Array.from(this.querySelectorAll('[role="tab"]'));
        this.tabs.forEach((tab, index) => {
          tab.addEventListener('click', () => this.selectTab(tab));
          tab.addEventListener('keydown', (event) => this.onKeydown(event, index));
        });
      }

      selectTab(selectedTab, setFocus = false) {
        this.tabs.forEach((tab) => {
          const isSelected = tab === selectedTab;
          tab.setAttribute('aria-selected', isSelected);
          tab.tabIndex = isSelected ? 0 : -1;
          const panel = this.querySelector(`#${tab.getAttribute('aria-controls')}`);
          if (panel) panel.hidden = !isSelected;
        });
        if (setFocus) selectedTab.focus();
      }

      onKeydown(event, index) {
        let newIndex;
        switch (event.key) {
          case 'ArrowRight':
            newIndex = (index + 1) % this.tabs.length;
            break;
          case 'ArrowLeft':
            newIndex = (index - 1 + this.tabs.length) % this.tabs.length;
            break;
          case 'Home':
            newIndex = 0;
            break;
          case 'End':
            newIndex = this.tabs.length - 1;
            break;
          default:
            return;
        }
        event.preventDefault();
        this.selectTab(this.tabs[newIndex], true);
      }
    }
  );
}
