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
 * Returns Default Address Linked To Customer (via Dynamic Link)
 * @param {String} customer Customer ID
 * @returns {Promise<String|undefined>} Address Name
 */
const getDefaultCustomerAddress = async (customer) => {
  const r = await window.frappe.call({
    method: "frappe.contacts.doctype.address.address.get_default_address",
    args: { doctype: "Customer", name: customer },
  });
  return r && r.message;
};

/**
 * Returns HTML Link To A Document
 * @param {String} route Doctype Route, e.g. "company"
 * @param {String} name Document Name
 * @returns {String} HTML Link
 */
const docLink = (route, name) =>
  `<a href="/app/${route}/${encodeURIComponent(
    name
  )}">${window.frappe.utils.escape_html(name)}</a>`;

/**
 * Asks User To Continue Without An Address
 * @param {String} message Translated Message Why Address Is Missing
 * @param {String} question Translated Question To Proceed
 * @returns {Promise<Boolean>} True If User Wants To Proceed
 */
const confirmWithoutAddress = (message, question) =>
  new Promise((resolve) => {
    window.frappe.hide_progress();
    window.frappe.confirm(
      message + "<br><br>" + question,
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

  // Use the global __() so `bench generate-pot-file` extracts these strings
  if (!companyAddressName) {
    const proceed = await confirmWithoutAddress(
      __(
        "No address found for company {0}. Please link an address with the company.",
        [docLink("company", company)]
      ),
      __("Do you want to proceed without company address?")
    );
    if (!proceed) return;
    showProgress(10, __("getting data..."));
  }

  const companyAddress = companyAddressName
    ? await getDocument("Address", companyAddressName)
    : EMPTY_ADDRESS;
  // Use the invoice's customer address, else the address linked to the customer
  const customerAddressName =
    frm.doc.customer_address ||
    (await getDefaultCustomerAddress(frm.doc.customer));

  if (!customerAddressName) {
    const proceed = await confirmWithoutAddress(
      __(
        "Address for customer {0} is not found or no address was linked with the customer.",
        [docLink("customer", frm.doc.customer)]
      ),
      __("Do you want to proceed without customer address?")
    );
    if (!proceed) return;
    showProgress(10, __("getting data..."));
  }

  // Without a customer address the debtor is left out of the bill
  const customerAddress = customerAddressName
    ? await getDocument("Address", customerAddressName)
    : null;
  const { iban } = await getDocument("Bank Account", bankAccount);

  showProgress(40, __("generating pdf..."));

  // Without a company address, take the country from the IBAN (CH / LI)
  const companyAddressCode = companyAddressName
    ? (await getDocument("Country", companyAddress.country)).code.toUpperCase()
    : iban.substring(0, 2).toUpperCase();
  const customerAddressCode = customerAddress
    ? (await getDocument("Country", customerAddress.country)).code.toUpperCase()
    : null;

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
