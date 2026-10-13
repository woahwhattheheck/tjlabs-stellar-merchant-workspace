/* SPDX-License-Identifier: MIT */
(function (root) {
  "use strict";
  async function openPanel(executionContext) {
    const formContext = executionContext.getFormContext();
    const control = formContext.getControl("WebResource_PMRSStaff");
    if (!control) throw Error("This project form does not contain its selected staff review panel.");
    const frame = await control.getContentWindow();
    for (let i = 0; i < 50; i++) {
      if (frame.TJLabsStaff && typeof frame.TJLabsStaff.initialize === "function") {
        await frame.TJLabsStaff.initialize({formContext, Xrm: root.Xrm});
        return;
      }
      await new Promise(resolve => root.setTimeout(resolve, 100));
    }
    throw Error("The original staff review web resource did not finish loading.");
  }
  root.TJLabsPMRSStaff = Object.freeze({openPanel});
})(window);
