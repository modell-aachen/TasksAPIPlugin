<template>
    <div class="flatskin-wrapped">
      <div class="input-group">
        <input type="text" data-format="dd.mm.yyyy" data-epoch="" name="" data-name="DueDate" ref="datepicker" v-bind:placeholder="placeholder">
        <span class="input-group-label" style="margin: 0 0 1rem;"><i class="fa fa-calendar calendersymbol" aria-hidden="true"></i></span>
      </div>
    </div>
</template>

<script>
/* global $ */
import MetaFieldMixin from '../../../mixins/MetaFieldMixin.vue';
export default {
    mixins: [MetaFieldMixin],
    props: ["placeholder"],
    mounted: function () {
		let self = this;
		let $datepicker = $(this.$refs.datepicker).pickadate();
		$datepicker.on("open",function() {
			self.fields[self.fieldName].value = this.get();
		});
    }
};
</script>

<style lang="sass">
</style>
