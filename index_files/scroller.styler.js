goog.provide('ng.ScrollerStyler');

goog.require('goog.events.EventHandler');


/**
 * @constructor
 */
ng.ScrollerStyler = function (scroller, container) {
  this.$scroller = scroller;
  this.container = container;
  this.viewport = container;
  this.carousel = this.container.firstElementChild;

  /**
   * The number of items to request at once.
   * @type {number}
   */
  this.buffer_length_ = 5;

  this.handler = new goog.events.EventHandler(this);

  this.ignore_scroll = false;

  /**
   * The number of px the carousel element is overflowing at the top.
   * @type {number}
   */
  this.skew = 0;

  this.offset = 0;

  /**
   * The scroll position from the last scroll event.
   * @type {number}
   */
  this.last_pos = 0;

  this.margin_before = 0;
  this.margin_after = 0;

  this.loading_items_before = false;
  this.loading_items_after = false;

  /**
   * The items that are in the DOM in any given moment.
   * @type {!Array.<{ scope: !angular.Scope, element: !Element }>}
   */
  this.items = [];
};


// ng.ScrollerStyler.prototype.setItemElementTemplate = function (item_template) {
//   this.item_template_ = item_template;
// };


ng.ScrollerStyler.prototype.setTransclusionFunction = function (transclude) {
  this.transclude = transclude;
};


ng.ScrollerStyler.prototype.registerEvents = function () {
  this.handler.listen(this.viewport, 'scroll', this.handleScroll);
  // this.handler.listen(this.viewport, 'mousewheel', this.handleMouseWheel);
};


ng.ScrollerStyler.prototype.init = function () {
  this.registerEvents();
  this.collectLoadingSpinner();

  var scroll = this.viewport.scrollTop || this.viewport.scrollY || 0;
  var offset = scroll + this.container.getBoundingClientRect().top;
  this.offset = offset;
  this.skew += offset;

  this.last_pos = this.getViewportScrollPosition();

  this.loadMoreItemsAfter(null);
};


ng.ScrollerStyler.prototype.collectLoadingSpinner = function () {
  this.loading_spinner_template = null;

  var nodes = this.carousel.childNodes;
  for (var i = 0, ii = nodes.length; i < ii; ++i) {
    var node = nodes[i];
    // TODO: Too restrictive; [ng-scroller-loading]?
    if (node.nodeType === 1 && node.classList.contains('loading')) {
      this.loading_spinner_template = node;
      this.carousel.removeChild(node);
      break;
    }
  }
};


ng.ScrollerStyler.prototype.getItemElementById = function (id) {
  var item_index = this.getItemIndexById(id);
  var item = this.items[item_index];

  return item ? item.element : null;
};


ng.ScrollerStyler.prototype.handleScroll = function (e) {
  var pos = this.getViewportScrollPosition();

  var viewport_height = this.getViewportHeight();
  var carousel_height = this.carousel.clientHeight;

  var frame_start = this.margin_before + this.offset;
  var frame_end = frame_start + carousel_height - viewport_height;
  frame_end = Math.max(frame_start, frame_end);

  var framed_pos = pos;

  if (this.loading_items_before) {
    framed_pos = Math.max(frame_start, framed_pos);
  }
  if (this.loading_items_after) {
    framed_pos = Math.min(frame_end, framed_pos);
  }

  var delta = framed_pos - this.last_pos;
  window.console.log('%cframe: [%d %d] pos: %d->%d skew: %d', 'color:navy', frame_start, frame_end, pos, framed_pos, this.skew);
  this.scroll(delta);
  this.last_pos += delta;

  if (framed_pos !== pos) {
    this.setViewportScrollPosition(framed_pos);
  }
};


// ng.ScrollerStyler.prototype.handleMouseWheel = function (e) {
  // can be eventually used to prevent scrolling
  // if () {
    // e.preventDefault();
  // }
// };


/**
 * @param {number} delta The scroll position delta from the last scroll event.
 */
ng.ScrollerStyler.prototype.scroll = function (delta) {
  if (this.ignore_scroll) {
    this.ignore_scroll = false;
    return;
  }

  this.skew -= delta;

  if (delta > 0) {
    this.shift();
    if (this.canPush()) {
      this.loadMoreItemsAfter(this.getLastItemId());
    }
  } else {
    this.pop();
    if (this.canUnshift()) {
      this.loadMoreItemsBefore(this.getFirstItemId());
    }
  }
};


ng.ScrollerStyler.prototype.getFirstItemId = function () {
  var items = this.items;
  var first_item = items[0];

  return first_item ? first_item.id : null;
};


ng.ScrollerStyler.prototype.getLastItemId = function () {
  var items = this.items;
  var last_item = items[items.length - 1];

  return last_item ? last_item.id : null;
};


ng.ScrollerStyler.prototype.requestMoreItemsBefore = function (next_id) {
  window.console.log('styler: request %d before %d', this.buffer_length_, next_id);
  var req = this.$scroller.loadRangeBefore(next_id, this.buffer_length_);

  return req;
};


ng.ScrollerStyler.prototype.requestMoreItemsAfter = function (prev_id) {
  window.console.log('styler: request %d after %d', this.buffer_length_, prev_id);
  var req = this.$scroller.loadRangeAfter(prev_id, this.buffer_length_);

  return req;
};


/**
 * @param {*} next_id An item id.
 * @return {!angular.$q.Promise} A promise.
 */
ng.ScrollerStyler.prototype.loadMoreItemsBefore = function (next_id) {
  var spinner, spinner_height;

  var self = this;

  /**
   * @param {!Array.<!ng.ScrollerItem>} items Newly loaded items.
   */
  var onRangeLoad = function (items) {
    window.console.log('styler: got items before %d', next_id);
    self.insertItemsBefore(next_id, items);

    self.skew += spinner_height;
    spinner.parentNode.removeChild(spinner);
    self.setViewportScrollPosition(
      self.getViewportScrollPosition() - spinner_height);

    self.loading_items_before = false;

    var next_item_index = self.getItemIndexById(next_id);
    var item_splice_args = [ next_item_index, 0 ].concat(items); 
    self.items.splice.apply(self.items, item_splice_args);

    // TODO: handle empty arrays
    if (self.canUnshift()) {
      self.loadMoreItemsBefore(items[0].id);
    }
  };

  var req = this.requestMoreItemsBefore(next_id);
  if (req) {
    this.loading_items_before = true;

    window.console.log('styler: add spinner before %d', next_id);
    spinner = this.insertLoadingSpinnerBefore(next_id);
    spinner_height = spinner.clientHeight;
    this.skew -= spinner_height;
    self.setViewportScrollPosition(
      self.getViewportScrollPosition() + spinner_height);

    req.then(onRangeLoad);
  }

  return req;
};


/**
 * @param {*} prev_id An item id.
 * @return {!angular.$q.Promise} A promise.
 */
ng.ScrollerStyler.prototype.loadMoreItemsAfter = function (prev_id) {
  var spinner;

  var self = this;

  /**
   * @param {!Array.<!ng.ScrollerItem>} items Newly loaded items.
   */
  var onRangeLoad = function (items) {
    window.console.log('styler: got items after %d', prev_id);
    self.insertItemsAfter(prev_id, items);
    spinner.parentNode.removeChild(spinner);

    self.loading_items_after = false;

    var prev_item_index = self.getItemIndexById(prev_id);
    var item_splice_args = [ prev_item_index + 1, 0 ].concat(items); 
    self.items.splice.apply(self.items, item_splice_args);

    // TODO: handle empty arrays
    if (self.canPush()) {
      self.loadMoreItemsAfter(items[items.length - 1].id);
    }
  };

  var req = this.requestMoreItemsAfter(prev_id);
  if (req) {
    this.loading_items_after = true;

    window.console.log('styler: add spinner after %d', prev_id);
    spinner = this.insertLoadingSpinnerAfter(prev_id);
    req.then(onRangeLoad);
  }

  return req;
};


ng.ScrollerStyler.prototype.getItemIndexById = function (id) {
  // TODO: keep ids in a separate array to allow faster (indexOf) lookup?
  var items = this.items;
  for (var i = 0, ii = items.length; i < ii; ++i) {
    if (items[i].id === id) {
      return i;
    }
  }

  return items.length - 1;
};


ng.ScrollerStyler.prototype.insertElementBefore = function (next_id, el) {
  var next_item_el;
  if (next_id) {
    next_item_el = this.getItemElementById(next_id);
  }
  next_item_el = next_item_el || this.carousel.firstChild;

  this.carousel.insertBefore(el, next_item_el);
};


ng.ScrollerStyler.prototype.insertElementAfter = function (prev_id, el) {
  var next_item_el = null;
  if (prev_id) {
    var prev_item_el = this.getItemElementById(prev_id);
    if (prev_item_el) {
      next_item_el = prev_item_el.nextSibling;
    }
  }

  this.carousel.insertBefore(el, next_item_el);
};


/**
 * @param {*} next_id An item id.
 * @return {!Element} A spinner element.
 */
ng.ScrollerStyler.prototype.insertLoadingSpinnerBefore = function (next_id) {
  var spinner = this.loading_spinner_template.cloneNode(true);
  this.insertElementBefore(next_id, spinner);

  return spinner;
};


/**
 * @param {*} prev_id An item id.
 * @return {!Element} A spinner element.
 */
ng.ScrollerStyler.prototype.insertLoadingSpinnerAfter = function (prev_id) {
  var spinner = this.loading_spinner_template.cloneNode(true);
  this.insertElementAfter(prev_id, spinner);

  return spinner;
};


/**
 * @param {*} next_id An item id.
 * @param {!Array.<!ng.ScrollerItem>} items The items to insert.
 */
ng.ScrollerStyler.prototype.insertItemsBefore = function (next_id, items) {
  var frag = document.createDocumentFragment();
  for (var i = 0, ii = items.length; i < ii; ++i) {
    frag.appendChild(items[i].element);
  }

  var prev_height = this.carousel.clientHeight;
  this.insertElementBefore(next_id, frag);

  var unshifted_height = this.carousel.clientHeight - prev_height;
  this.skew -= unshifted_height;
/*
  var margin_before = this.margin_before;
  if (unshifted_height < margin_before) {
    margin_before -= unshifted_height;
    this.skew += margin_before;
    unshifted_height = 0;
  } else {
    this.skew += margin_before;
    unshifted_height -= margin_before;
    margin_before = 0;
  }

  this.margin_before = margin_before;
  this.applyMargins();
*/
  this.setViewportScrollPosition(
    this.getViewportScrollPosition() + unshifted_height);
};


/**
 * @param {*} prev_id An item id.
 * @param {!Array.<!ng.ScrollerItem>} items The items to insert.
 */
ng.ScrollerStyler.prototype.insertItemsAfter = function (prev_id, items) {
  var frag = document.createDocumentFragment();
  for (var i = 0, ii = items.length; i < ii; ++i) {
    frag.appendChild(items[i].element);
  }

  var prev_height = this.carousel.clientHeight;
  this.insertElementAfter(prev_id, frag);

  // TODO: handle empty arrays
  if (items[items.length - 1].element.nextSibling) {
    this.margin_after -= this.carousel.clientHeight - prev_height;
    this.margin_after = Math.max(0, this.margin_after);
    this.applyMargins();
  }
};


ng.ScrollerStyler.prototype.shift = function () {
  var items = this.items;

  while (this.canShift()) {
    var item = items[0];
    var height = item.element.clientHeight;
    
    this.skew += height;
    this.margin_before += height;

    // TODO: prevent layout on each iteration
    this.carousel.removeChild(item.element);
    this.$scroller.disposeItem(items.shift());

    this.applyMargins();
    window.console.log('styler: shift 1');
  }
};


ng.ScrollerStyler.prototype.pop = function () {
  var items = this.items;

  while (this.canPop()) {
    var item = items[items.length - 1];
    var height = item.element.clientHeight;
    
    this.margin_after += height;

    // TODO: prevent layout on each iteration
    this.carousel.removeChild(item.element);
    this.$scroller.disposeItem(items.pop());

    this.applyMargins();
    window.console.log('styler: pop 1');
  }
};


ng.ScrollerStyler.prototype.canUnshift = function () {
  window.console.log('canUnshift: %d > 0', this.skew);
  return (this.skew > 0);
};


ng.ScrollerStyler.prototype.canShift = function () {
  var first_item = this.items[0];
  if (!first_item) {
    return false;
  }

  var first_height = first_item.element.clientHeight;
  return (-this.skew >= first_height);
};


ng.ScrollerStyler.prototype.canPush = function () {
  var viewport_height = this.getViewportHeight();
  var carousel_height = this.carousel.clientHeight;

  return (viewport_height >= carousel_height + this.skew);
};

  
ng.ScrollerStyler.prototype.canPop = function () {
  var last_item = this.items[this.items.length - 1];
  if (!last_item) {
    return false;
  }

  var viewport_height = this.getViewportHeight()
  var carousel_height = this.carousel.clientHeight;
  var last_height = last_item.element.clientHeight;

  window.console.log('canPop: %d + %d - %d - %d >= 0', carousel_height, this.skew, viewport_height, last_height);
  return (carousel_height + this.skew - viewport_height - last_height >= 0);
};


ng.ScrollerStyler.prototype.getViewportHeight = function () {
  return this.viewport.clientHeight || this.viewport.innerHeight || 0;
};


ng.ScrollerStyler.prototype.getViewportScrollPosition = function () {
  return this.viewport.scrollTop || this.viewport.scrollY || 0;
};


ng.ScrollerStyler.prototype.setViewportScrollPosition = function (pos) {
  this.ignore_scroll = true;

  if ('scrollTop' in this.viewport) {
    this.viewport.scrollTop = pos;
  } else {
    this.viewport.scrollTo(this.viewport.scrollX, pos);
  }
};


ng.ScrollerStyler.prototype.applyMargins = function () {
  this.carousel.style.marginTop = this.margin_before + 'px';
  this.carousel.style.marginBottom = this.margin_after + 'px';
};
