const { global, menu, utils, console } = iina;

console.log("PHIMWAY GLOBAL LOADED");

menu.addItem(
  menu.item("Open Phimway Movie ID...", () => {
    try {
      const id = utils.prompt("Enter Phimway Movie ID:");

      if (!id) {
        console.log("No ID entered");
        return;
      }

      const movieId = String(id).trim();
      const label = `phimway-${movieId}-${Date.now()}`;

      console.log("Creating player for Phimway ID:", movieId);
      console.log("Label:", label);

      const player = global.createPlayerInstance({
        enablePlugins: true,
        label
      });

      console.log("Player created:", player);
    } catch (e) {
      console.log("Global error:", e.message || e);
    }
  })
);