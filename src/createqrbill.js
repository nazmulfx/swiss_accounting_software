/*! *****************************************************************************
Licensed under the GPL, Version 3.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at https://www.gnu.org/licenses/gpl-3.0.en.html

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

***************************************************************************** */
import { generateQRPDF } from "./generateqrpdf";
import { generateQRConfig } from "./qrconfig";
import {
  getCurrency,
  getDocument,
  getLanguageCode,
  getReferenceCode,
  showError,
  showProgress,
} from "./utils";

const EMPTY_ADDRESS = {
  address_line1: "",
  address_line2: null,
  pincode: "",
  city: "",
};

/**
 * Returns Default Address Linked To Company
 * @param {String} company Company Name
 * @returns {Promise<String|undefined>} Address Name
 */
const getDefaultCompanyAddress = async (company) => {
  const r = await window.frappe.call({
    method: "erpnext.setup.doctype.company.company.get_default_company_address",
    args: { name: company },
  });
  return r && r.message;
};

/**
 * Asks User To Continue Without Company Address
 * @param {String} company Company Name
 * @returns {Promise<Boolean>} True If User Wants To Proceed
 */
const confirmWithoutCompanyAddress = (company) =>
  new Promise((resolve) => {
    const companyLink = `<a href="/app/company/${encodeURIComponent(
      company
    )}">${window.frappe.utils.escape_html(company)}</a>`;
    // Use the global __() so `bench generate-pot-file` extracts these strings
    window.frappe.confirm(
      __(
        "No address found for company {0}. Please link an address with the company.",
        [companyLink]
      ) +
        "<br><br>" +
        __("Do you want to proceed without company address?"),
      () => resolve(true),
      () => resolve(false)
    );
  });

export const createQRBill = async (frm) => {
  showProgress(10, __("getting data..."));
  var customer = ""

  // If customer name exists separately
  if (!frm.doc.customer_name) {
    customer = frm.doc.customer
  } else {
    customer = frm.doc.customer_name
  }

  const amount = frm.doc.outstanding_amount;
  const reference = getReferenceCode(frm.doc.name);
  const company = frm.doc.company;
  const language = getLanguageCode(frm.doc.language);
  const bank = await getDocument("Swiss QR Bill Settings", company);
  const bankAccount = bank.bank_account;
  const currency = getCurrency(frm.doc.currency);
  if (!currency) return;

  // Use the invoice's company address, else the address linked to the company
  const companyAddressName =
    frm.doc.company_address || (await getDefaultCompanyAddress(company));

  if (!companyAddressName) {
    window.frappe.hide_progress();
    const proceed = await confirmWithoutCompanyAddress(company);
    if (!proceed) return;
    showProgress(10, __("getting data..."));
  }

  const companyAddress = companyAddressName
    ? await getDocument("Address", companyAddressName)
    : EMPTY_ADDRESS;
  const customerAddress = await getDocument(
    "Address",
    frm.doc.customer_address
  );
  const { iban } = await getDocument("Bank Account", bankAccount);

  showProgress(40, __("generating pdf..."));

  const customerCountry = await getDocument("Country", customerAddress.country);

  // Without a company address, take the country from the IBAN (CH / LI)
  const companyAddressCode = companyAddressName
    ? (await getDocument("Country", companyAddress.country)).code.toUpperCase()
    : iban.substring(0, 2).toUpperCase();
  const customerAddressCode = customerCountry.code.toUpperCase();

  const config = generateQRConfig(
    currency,
    amount,
    company,
    companyAddress,
    companyAddressCode,
    iban,
    customer,
    customerAddress,
    customerAddressCode,
    reference
  );

  // frm.docname is correct
  generateQRPDF(config, frm.docname, frm, language);

};
