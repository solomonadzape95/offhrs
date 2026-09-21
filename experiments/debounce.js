function debounce(func, delay) {
  // create timer
  let timerID;

  // return a new function
  return function (...args) {
    // clear prev timer if user typed again
    clearTimeout(timerID);

    // start new timer
    timerID = setTimeout(() => {
      //execute the original function
      func.apply(this, args);
    }, delay);
  };
}

const search = debounce((query) => console.log("Fetching: ", query), 2000);
search("er");
