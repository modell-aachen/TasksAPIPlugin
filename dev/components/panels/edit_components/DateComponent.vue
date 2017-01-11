<template>
    <div class="flatskin-wrapped">
      <div class="input-group">
      	<span class="input-group-label"><i class="fa fa-calendar calendersymbol" aria-hidden="true"></i></span>
        <input type="text" class="input-group-field" data-format="dd.mm.yyyy" data-epoch="" name="" data-name="DueDate" ref="datepicker" v-bind:placeholder="placeholder">
        
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
		let $datepicker = $(this.$refs.datepicker).pickadate({
			format: 'dd.mm.yyyy',
			onSet: function(thingSet) {
				self.fields[self.fieldName].value = Math.floor(thingSet.select/1000);
				console.log('Date: ', thingSet.select);
			}
		}).pickadate('picker');
		$datepicker.set('select', Math.floor(self.fields[self.fieldName].value*1000));
	}
};
</script>

<style lang="sass">
</style>
